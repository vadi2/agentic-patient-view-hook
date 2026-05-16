import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import type { CdsCard, CdsIndicator } from "../fhir/types";

export const defaultClient = new Anthropic({ apiKey: config.anthropicApiKey });

// Stable instructions are prompt-cached so repeated patient-view calls only pay
// to process the (variable) clinical digest.
const SYSTEM_PROMPT = `You are a clinical decision support assistant embedded in a CDS Hooks patient-view service.

You receive a pre-summarized clinical digest for a single patient (conditions,
medications, labs, vitals, notes, imaging and reports - already flattened from
FHIR, not raw JSON).

Determine the single most important "Uppmärksamhetsinformation" (Swedish patient
safety alert): the one thing a clinician must be aware of when opening this chart.

Report exactly one alert by calling the report_uppmarksamhetsinformation tool.
If nothing is noteworthy, still call the tool with indicator "info" and say so.`;

const TOOL: Anthropic.Tool = {
  name: "report_uppmarksamhetsinformation",
  description:
    "Report the single most important patient safety alert for this chart.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        maxLength: 140,
        description: "Headline alert, <= 140 characters.",
      },
      detail: {
        type: "string",
        description: "Short markdown with the key supporting findings.",
      },
      indicator: {
        type: "string",
        enum: ["info", "warning", "critical"],
        description: "Clinical urgency of the alert.",
      },
    },
    required: ["summary", "detail", "indicator"],
  },
};

interface Verdict {
  summary: string;
  detail: string;
  indicator: CdsIndicator;
}

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

export async function analyzePrefetch(
  summaryText: string,
  client: Anthropic = defaultClient,
): Promise<CdsCard> {
  const message = await createWithRetry(client, {
    model: config.claudeModel,
    max_tokens: 1024,
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

  const verdict = extractVerdict(message);

  return {
    summary: verdict.summary,
    detail: verdict.detail,
    indicator: verdict.indicator,
    source: {
      label: "Agentic patient-view (Claude)",
      icon: `${config.publicBaseUrl}/icon.png`,
    },
  };
}

function extractVerdict(message: Anthropic.Message): Verdict {
  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Claude returned no tool_use block for the verdict");
  }
  const input = toolUse.input as Partial<Verdict>;
  if (!input.summary || !input.indicator) {
    throw new Error("Claude tool_use input missing required fields");
  }
  return {
    summary: input.summary,
    detail: input.detail ?? "",
    indicator: input.indicator,
  };
}
