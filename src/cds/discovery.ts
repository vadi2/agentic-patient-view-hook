import type { CdsDiscovery } from "../fhir/types";

// Experimental, CDS-Hooks-generic extension key. The CDS Hooks spec
// (https://cds-hooks.org/specification/current/#extensions) reserves
// `extension` for vendor-defined behavior and recommends a globally unique
// identifier; we use a cds-hooks.org URL under `/experimental/` to signal
// "community-style, not normative yet". The key being a URL mirrors the FHIR
// extension idiom.
//
// Semantics: when present and truthy, the service is expected to take
// noticeably longer than a typical CDS Hooks call (we call Claude, which is
// several seconds). EHRs that recognize the key should render a wait
// indicator instead of a hard timeout.
export const LONG_RUNNING_EXTENSION_URL =
  "https://cds-hooks.org/experimental/long-running";

// CDS Hooks discovery document. The prefetch templates ask the EHR to deliver
// the resources Claude needs so the service stays a single round trip.
//
// The generated `CDSHooksServices` types both `prefetch` and `extension` as
// FHIR-logical-model arrays (for validator round-tripping); on the wire both
// are plain objects keyed by string. The discovery value below uses the wire
// shape and casts at the export boundary.
export const discovery = {
  services: [
    {
      hook: "patient-view",
      id: "agentic-patient-view",
      title: "Agentic patient-view Uppmärksamhetsinformation",
      description:
        "Analyzes the patient prefetch with Claude and surfaces the key patient safety alert as an icon card.",
      prefetch: {
        patient: "Patient/{{context.patientId}}",
        conditions: "Condition?patient={{context.patientId}}",
        medications: "MedicationRequest?patient={{context.patientId}}",
        labs: "Observation?patient={{context.patientId}}&category=laboratory",
        observations: "Observation?patient={{context.patientId}}&category=vital-signs",
        notes: "DocumentReference?patient={{context.patientId}}",
        imaging: "ImagingStudy?patient={{context.patientId}}",
        reports: "DiagnosticReport?patient={{context.patientId}}",
      },
      extension: {
        [LONG_RUNNING_EXTENSION_URL]: true,
      },
    },
  ],
} as const satisfies {
  services: ReadonlyArray<
    Omit<
      NonNullable<CdsDiscovery["services"]>[number],
      "prefetch" | "extension"
    > & {
      prefetch?: Record<string, string>;
      extension?: Record<string, unknown>;
    }
  >;
};
