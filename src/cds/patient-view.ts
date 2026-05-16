import { analyzePrefetch } from "../claude/analyze";
import { config } from "../config";
import { summarizePrefetch } from "../fhir/summarize";
import type { CdsCard, CdsHookRequest, CdsResponse } from "../fhir/types";

const ICON_SOURCE = {
  label: "Agentic patient-view (Claude)",
  icon: `${config.publicBaseUrl}/icon.png`,
};

function infoCard(summary: string, detail: string): CdsCard {
  return { summary, detail, indicator: "info", source: ICON_SOURCE };
}

export async function handlePatientView(
  req: CdsHookRequest,
): Promise<CdsResponse> {
  if (req.hook !== "patient-view") {
    throw new Error(`Unsupported hook: ${req.hook}`);
  }

  const { text, hasData } = summarizePrefetch(req.prefetch);

  // No clinical data - return a benign card and skip the Claude call (cost).
  if (!hasData) {
    return {
      cards: [
        infoCard(
          "No clinical data available to analyze",
          "The patient-view prefetch contained no conditions, medications, labs, observations, notes, imaging or reports.",
        ),
      ],
    };
  }

  // Fail soft: a CDS service must never break the EHR chart view, so any
  // analysis failure degrades to a single non-blocking info card.
  try {
    const card = await analyzePrefetch(text);
    return { cards: [card] };
  } catch (err) {
    console.error("analyzePrefetch failed, returning fail-soft card:", err);
    return {
      cards: [
        infoCard(
          "Uppmärksamhetsinformation unavailable - automated analysis failed",
          "The automated patient safety analysis could not be completed. Review the chart manually.",
        ),
      ],
    };
  }
}
