// CDS Hooks discovery document. The prefetch templates ask the EHR to deliver
// the resources Claude needs so the service stays a single round trip.
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
} as const;
