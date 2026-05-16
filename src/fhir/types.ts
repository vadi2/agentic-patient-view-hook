// FHIR resource shapes come from `@atomic-ehr/codegen`-generated types in
// `src/fhir-types/`. The CDS Hooks envelope itself is not FHIR, so those
// shapes stay hand-written here.
import type {
  Bundle,
  Condition,
  DiagnosticReport,
  DocumentReference,
  ImagingStudy,
  MedicationRequest,
  Observation,
  Patient,
} from "../fhir-types/hl7-fhir-r4-core";

export type {
  Bundle,
  Condition,
  DiagnosticReport,
  DocumentReference,
  ImagingStudy,
  MedicationRequest,
  Observation,
  Patient,
};

/** Each prefetch key resolves to either a single resource or a search-set Bundle. */
export interface PatientViewPrefetch {
  patient?: Patient;
  conditions?: Bundle<Condition>;
  medications?: Bundle<MedicationRequest>;
  labs?: Bundle<Observation>;
  observations?: Bundle<Observation>;
  notes?: Bundle<DocumentReference>;
  imaging?: Bundle<ImagingStudy>;
  reports?: Bundle<DiagnosticReport>;
}

export interface CdsHookRequest {
  hook: string;
  hookInstance: string;
  context: {
    userId?: string;
    patientId: string;
    [key: string]: unknown;
  };
  prefetch?: PatientViewPrefetch;
}

export interface CdsCardSource {
  label: string;
  url?: string;
  /** Rendered by the EHR next to the card - this is the Uppmärksamhetsinformation icon. */
  icon?: string;
}

export interface CdsCard {
  uuid?: string;
  summary: string;
  detail?: string;
  indicator: "info" | "warning" | "critical";
  source: CdsCardSource;
}

export interface CdsResponse {
  cards: CdsCard[];
}
