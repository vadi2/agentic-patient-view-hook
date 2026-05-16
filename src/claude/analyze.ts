import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config";
import {
  isUmiCategory,
  isUmiSeverity,
  type UmiFinding,
} from "../umi/types";

// Mirrors fhir-profile-diff/src/explain/diff.ts: drive Claude with the Agent
// SDK, no tools, no filesystem access - the prompt carries everything the
// model needs. We diverge from that file only in collecting a single JSON
// payload at the end (we need structured output to drive the UMI icon),
// rather than streaming prose.
const SYSTEM_PROMPT = `You are a clinical decision support assistant embedded in a CDS Hooks patient-view service.

You receive a pre-summarized clinical digest for a single patient (conditions,
medications, labs, vitals, notes, imaging and reports - already flattened from
FHIR, not raw JSON).

Identify the patient-safety attention information ("Uppmärksamhetsinformation",
UMI). Classify each finding into exactly one of the five UMI categories:

- "medical": other significant medical condition, ongoing treatment, or the
  presence of an implant or graft.
- "infection": presence of an infectious agent (e.g. MRSA) or a communicable
  disease (smittämne / smittsam sjukdom).
- "hypersensitivity": an allergy or hypersensitivity state. ALWAYS include
  "severity":
  - "life-threatening": can be directly life-threatening (anaphylaxis,
    Stevens-Johnson, airway-obstructing angioedema).
  - "harmful": can cause lasting harm (e.g. hepatotoxic drug reaction).
  - "discomforting": bothersome but not harmful or life-threatening.
- "care-routine": a decision or information that should lead to a special care
  routine (e.g. palliative-care decision, CPR stance).
- "unstructured": historical free-text attention information; rarely derivable
  from a structured prefetch - use sparingly.

This is decision support, NOT the authoritative regulated UMI record.

You must respond with a single JSON object and nothing else - no preamble, no
markdown fence, no commentary. The shape is:

{"findings":[{"category":"...","severity":"...","summary":"...","detail":"..."}]}

Rules:
- "findings" is an array. Empty array means "nothing noteworthy".
- "category" is one of the five strings above.
- "severity" is required iff category is "hypersensitivity"; omit otherwise.
- "summary" is <= 140 characters.
- "detail" is short markdown supporting detail.
- Do not run any tools - everything you need is in the prompt.`;

const JSON_RE = /\{[\s\S]*\}/;

function extractJson(raw: string): unknown {
  // The model is told to emit pure JSON, but be defensive: pull the first
  // {...} block in case it adds a stray prose line.
  const match = raw.match(JSON_RE);
  if (!match) {
    throw new Error("Claude returned no JSON object");
  }
  return JSON.parse(match[0]);
}

function coerceFindings(parsed: unknown): UmiFinding[] {
  const raw = (parsed as { findings?: unknown } | null)?.findings;
  if (!Array.isArray(raw)) return [];

  // Drop any finding the model malformed rather than failing the whole response.
  return raw.flatMap((entry): UmiFinding[] => {
    const e = entry as Partial<UmiFinding>;
    if (
      !isUmiCategory(e.category) ||
      typeof e.summary !== "string" ||
      e.summary.length === 0
    ) {
      return [];
    }
    const finding: UmiFinding = {
      category: e.category,
      summary: e.summary,
      detail: typeof e.detail === "string" ? e.detail : "",
    };
    if (e.category === "hypersensitivity") {
      finding.severity = isUmiSeverity(e.severity)
        ? e.severity
        : "discomforting";
    }
    return [finding];
  });
}

/**
 * Classify the digest into UMI findings via the Claude Agent SDK. Returns []
 * when Claude finds nothing. Throws when the agent ends without a usable
 * result so the handler can distinguish "no UMI" (benign card) from
 * "analysis failed" (fail-soft).
 *
 * `runQuery` is injectable so tests can stub the SDK with an async iterator
 * of SDKMessage values - we never spin up the real agent in unit tests.
 */
export type QueryRunner = typeof query;

export async function analyzePrefetch(
  summaryText: string,
  runQuery: QueryRunner = query,
): Promise<UmiFinding[]> {
  const options: Options = {
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: [],
    model: config.claudeModel,
    maxTurns: 1,
  };

  let resultText: string | undefined;
  for await (const message of runQuery({ prompt: summaryText, options })) {
    if (message.type === "result" && message.subtype === "success") {
      resultText = message.result;
    }
  }

  if (!resultText) {
    throw new Error("Claude agent ended without a successful result");
  }

  return coerceFindings(extractJson(resultText));
}
