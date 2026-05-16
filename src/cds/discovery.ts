import type { CdsDiscovery } from "../fhir/types";

// CDS Hooks discovery document. The prefetch templates ask the EHR to deliver
// the resources Claude needs so the service stays a single round trip.
//
// The generated `CDSHooksServices` types `prefetch` as an array of {key,value}
// for FHIR validator round-tripping; on the wire it's a plain object keyed by
// template name. The discovery value below uses the wire shape and casts at
// the export boundary.
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
    },
  ],
} as const satisfies {
  services: ReadonlyArray<
    Omit<NonNullable<CdsDiscovery["services"]>[number], "prefetch"> & {
      prefetch?: Record<string, string>;
    }
  >;
};
