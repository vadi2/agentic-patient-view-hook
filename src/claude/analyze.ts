import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import type { CdsCard, PatientViewPrefetch } from "../fhir/types";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

// Stable instructions are cached so repeated patient-view calls only pay to
// process the (variable) prefetch payload.
const SYSTEM_PROMPT = `You are a clinical decision support assistant embedded in a CDS Hooks patient-view service.

You receive a FHIR prefetch for a single patient containing conditions, medications,
labs, clinical notes, imaging, lab reports and observations.

Produce a concise "Uppmärksamhetsinformation" (Swedish patient safety alert): the
single most important thing a clinician should be aware of when opening this chart.

Respond ONLY with minified JSON of the form:
{"summary": string, "detail": string, "indicator": "info"|"warning"|"critical"}

- "summary": <= 140 chars, the headline alert.
- "detail": short markdown, key supporting findings.
- "indicator": clinical urgency.
If nothing noteworthy, return indicator "info" and say so plainly.`;

const ALERT_ICON =
  "https://raw.githubusercontent.com/cds-hooks/docs/master/docs/images/cds-hooks-logo.png";

interface ClaudeVerdict {
  summary: string;
  detail: string;
  indicator: CdsCard["indicator"];
}

export async function analyzePrefetch(
  prefetch: PatientViewPrefetch,
): Promise<CdsCard> {
  const message = await client.messages.create({
    model: config.claudeModel,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Patient prefetch:\n\`\`\`json\n${JSON.stringify(prefetch)}\n\`\`\``,
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const verdict = parseVerdict(text);

  return {
    summary: verdict.summary,
    detail: verdict.detail,
    indicator: verdict.indicator,
    source: {
      label: "Agentic patient-view (Claude)",
      icon: ALERT_ICON,
    },
  };
}

function parseVerdict(text: string): ClaudeVerdict {
  try {
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as Partial<ClaudeVerdict>;
    if (!parsed.summary || !parsed.indicator) {
      throw new Error("missing required fields");
    }
    return {
      summary: parsed.summary,
      detail: parsed.detail ?? "",
      indicator: parsed.indicator,
    };
  } catch (err) {
    throw new Error(
      `Could not parse Claude response as verdict JSON: ${(err as Error).message}`,
    );
  }
}
