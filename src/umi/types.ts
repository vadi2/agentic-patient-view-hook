// UMI = Uppmärksamhetsinformation (Socialstyrelsen attention-information spec
// v5.1). The national "uppmärksamhetssymbol" is ONE composite badge: a 16-point
// star with four wedge arms and a central exclamation mark. Each region lights
// up iff the corresponding category is active; the centre encodes the
// hypersensitivity severity. These are the five categories the spec maps to
// Flag.category (profile groups A-E in the HL7 Sweden IG).
export const UMI_CATEGORIES = [
  "medical", // A - medical conditions & treatments (implants/grafts/treatment)
  "infection", // B - smittämne / smittsam sjukdom
  "hypersensitivity", // C - överkänslighet (severity-graded)
  "care-routine", // D - beslut/information som kan leda till särskild vårdrutin
  "unstructured", // E - historical free-text UMI (rarely derivable)
] as const;
export type UmiCategory = (typeof UMI_CATEGORIES)[number];

// Spec hypersensitivity severity scale (besvärande/skadlig/livshotande).
export const UMI_SEVERITIES = [
  "life-threatening",
  "harmful",
  "discomforting",
] as const;
export type UmiSeverity = (typeof UMI_SEVERITIES)[number];

/**
 * The composite symbol state for one patient - which category regions are
 * active, plus the hypersensitivity severity (or "none").
 */
export interface UmiState {
  medical: boolean;
  infection: boolean;
  careRoutine: boolean;
  unstructured: boolean;
  hypersensitivity: UmiSeverity | "none";
}

/** One classified finding, used to build the card body text. */
export interface UmiFinding {
  category: UmiCategory;
  /** Required when category is "hypersensitivity". */
  severity?: UmiSeverity;
  /** Headline, <= 140 chars. */
  summary: string;
  /** Short markdown supporting detail. */
  detail: string;
}

export const EMPTY_STATE: UmiState = {
  medical: false,
  infection: false,
  careRoutine: false,
  unstructured: false,
  hypersensitivity: "none",
};

export function isUmiCategory(v: unknown): v is UmiCategory {
  return UMI_CATEGORIES.includes(v as UmiCategory);
}

export function isUmiSeverity(v: unknown): v is UmiSeverity {
  return UMI_SEVERITIES.includes(v as UmiSeverity);
}

/** Severity ranked most-severe-first (index 0 = life-threatening). */
export function severityRank(s: UmiSeverity): number {
  return UMI_SEVERITIES.indexOf(s);
}

/** Fold classified findings into a single composite symbol state. */
export function findingsToState(findings: UmiFinding[]): UmiState {
  const state: UmiState = { ...EMPTY_STATE };
  for (const f of findings) {
    switch (f.category) {
      case "medical":
        state.medical = true;
        break;
      case "infection":
        state.infection = true;
        break;
      case "care-routine":
        state.careRoutine = true;
        break;
      case "unstructured":
        state.unstructured = true;
        break;
      case "hypersensitivity": {
        const sev = f.severity ?? "discomforting";
        if (
          state.hypersensitivity === "none" ||
          severityRank(sev) < severityRank(state.hypersensitivity)
        ) {
          state.hypersensitivity = sev;
        }
        break;
      }
    }
  }
  return state;
}

export function hasAnyUmi(state: UmiState): boolean {
  return (
    state.medical ||
    state.infection ||
    state.careRoutine ||
    state.unstructured ||
    state.hypersensitivity !== "none"
  );
}
