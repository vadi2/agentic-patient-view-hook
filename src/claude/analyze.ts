import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import {
  isUmiCategory,
  isUmiSeverity,
  type UmiFinding,
} from "../umi/types";

export const defaultClient = new Anthropic({ apiKey: config.anthropicApiKey });

// Stable instructions are prompt-cached so repeated patient-view calls only pay
// to process the (variable) clinical digest. Category definitions are lifted
// from the Socialstyrelsen UMI v5.1 specification (Flag.category groups A-E).
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
Report every distinct finding by calling the report_umi tool. Return an empty
findings array if there is nothing noteworthy.`;

const TOOL: Anthropic.Tool = {
  name: "report_umi",
  description:
    "Report the patient's attention information (UMI) findings, classified per the Socialstyrelsen UMI specification.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        description: "Distinct UMI findings. May be empty.",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [
                "medical",
                "infection",
                "hypersensitivity",
                "care-routine",
                "unstructured",
              ],
              description: "UMI category.",
            },
            severity: {
              type: "string",
              enum: ["life-threatening", "harmful", "discomforting"],
              description:
                "Required for category 'hypersensitivity'; omit otherwise.",
            },
            summary: {
              type: "string",
              maxLength: 140,
              description: "Headline finding, <= 140 characters.",
            },
            detail: {
              type: "string",
              description: "Short markdown with the key supporting findings.",
            },
          },
          required: ["category", "summary", "detail"],
        },
      },
    },
    required: ["findings"],
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err: unknown): boolean {
  // APIConnectionError extends APIError with no status, so check it first.
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    return status === 429 || (typeof status === "number" && status >= 500);
  }
  return false;
}

async function createWithRetry(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const backoffsMs = [2000, 4000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (err) {
      if (attempt < backoffsMs.length && isRetryable(err)) {
        await sleep(backoffsMs[attempt]!);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Classify the digest into UMI findings. Returns [] when Claude finds nothing.
 * Throws only when the model returns no tool_use block at all, so the handler
 * can distinguish "no UMI" (benign card) from "analysis failed" (fail-soft).
 */
export async function analyzePrefetch(
  summaryText: string,
  client: Anthropic = defaultClient,
): Promise<UmiFinding[]> {
  const message = await createWithRetry(client, {
    model: config.claudeModel,
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: summaryText }],
  });

  return extractFindings(message);
}

function extractFindings(message: Anthropic.Message): UmiFinding[] {
  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Claude returned no tool_use block for the UMI report");
  }
  const raw = (toolUse.input as { findings?: unknown }).findings;
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
