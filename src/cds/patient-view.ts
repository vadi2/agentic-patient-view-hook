import { analyzePrefetch } from "../claude/analyze";
import { config } from "../config";
import { summarizePrefetch } from "../fhir/summarize";
import type { CdsCard, CdsHookRequest, CdsResponse } from "../fhir/types";
import { compositeKey, NEUTRAL_KEY, umiIndicator } from "../umi/icon";
import {
  findingsToState,
  hasAnyUmi,
  type UmiCategory,
  type UmiFinding,
} from "../umi/types";

// LLM-derived, so labelled as decision support - not the authoritative
// regulated Socialstyrelsen UMI record.
const SOURCE_LABEL = "Agentic patient-view UMI (decision support)";

const CATEGORY_LABEL: Record<UmiCategory, string> = {
  medical: "Medical conditions & treatments",
  infection: "Infection",
  hypersensitivity: "Hypersensitivity",
  "care-routine": "Special care routine",
  unstructured: "Unstructured alert information",
};

function iconUrl(key: string): string {
  return `${config.publicBaseUrl}/umi/${key}.png`;
}

function neutralCard(summary: string, detail: string): CdsCard {
  return {
    summary,
    detail,
    indicator: "info",
    source: { label: SOURCE_LABEL, icon: iconUrl(NEUTRAL_KEY) },
  };
}

/** One composite card whose icon is the full national symbol for the patient. */
function compositeCard(findings: UmiFinding[]): CdsCard {
  const state = findingsToState(findings);

  const groups = new Map<UmiCategory, UmiFinding[]>();
  for (const f of findings) {
    const list = groups.get(f.category);
    if (list) list.push(f);
    else groups.set(f.category, [f]);
  }

  const detail = [...groups.entries()]
    .map(([cat, items]) => {
      const lines = items
        .map((i) => `- ${i.summary}${i.detail ? ` — ${i.detail}` : ""}`)
        .join("\n");
      return `**${CATEGORY_LABEL[cat]}**\n${lines}`;
    })
    .join("\n\n");

  const present = [...groups.keys()].map((c) => CATEGORY_LABEL[c]);
  const summary = `Uppmärksamhetsinformation: ${present.join(", ")}`;

  return {
    summary: summary.slice(0, 140),
    detail,
    indicator: umiIndicator(state),
    source: { label: SOURCE_LABEL, icon: iconUrl(compositeKey(state)) },
  };
}

export async function handlePatientView(
  req: CdsHookRequest,
): Promise<CdsResponse> {
  if (req.hook !== "patient-view") {
    throw new Error(`Unsupported hook: ${req.hook}`);
  }

  const { text, hasData } = summarizePrefetch(req.prefetch);

  // No clinical data - benign card, skip the Claude call (cost).
  if (!hasData) {
    return {
      cards: [
        neutralCard(
          "No clinical data available to analyze",
          "The patient-view prefetch contained no conditions, medications, labs, observations, notes, imaging or reports.",
        ),
      ],
    };
  }

  // Fail soft: a CDS service must never break the EHR chart view, so any
  // analysis failure degrades to a single non-blocking info card.
  let findings: UmiFinding[];
  try {
    findings = await analyzePrefetch(text);
  } catch (err) {
    console.error("analyzePrefetch failed, returning fail-soft card:", err);
    return {
      cards: [
        neutralCard(
          "Uppmärksamhetsinformation unavailable - automated analysis failed",
          "The automated patient safety analysis could not be completed. Review the chart manually.",
        ),
      ],
    };
  }

  if (!hasAnyUmi(findingsToState(findings))) {
    return {
      cards: [
        neutralCard(
          "No attention information identified",
          "The automated analysis found no Uppmärksamhetsinformation to highlight for this patient.",
        ),
      ],
    };
  }

  return { cards: [compositeCard(findings)] };
}
