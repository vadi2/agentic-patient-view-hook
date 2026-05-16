// FHIR resource shapes come from `@atomic-ehr/codegen`-generated types in
// `src/fhir-types/`. The CDS Hooks envelope shapes are now also generated,
// from the cds-hooks logical models published in the FHIR tools IG
// (hl7.fhir.uv.tools.r4) - see scripts/generate-types.ts.
import type {
  Bundle,
  Condition,
  DiagnosticReport,
  DocumentReference,
  ImagingStudy,
  MedicationRequest,
  Observation,
  Patient,
  Resource,
} from "../fhir-types/hl7-fhir-r4-core";
import type {
  CDSHooksRequest,
  CDSHooksResponse,
  CDSHooksResponseCards,
  CDSHooksResponseCardsSource,
  CDSHooksServices,
} from "../fhir-types/hl7-fhir-uv-tools-r4";

export type {
  Bundle,
  Condition,
  DiagnosticReport,
  DocumentReference,
  ImagingStudy,
  MedicationRequest,
  Observation,
  Patient,
  Resource,
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

/**
 * CDS Hooks request envelope. The generated `CDSHooksRequest` models prefetch
 * as an array of `{key, value}` entries (for FHIR validator compatibility); on
 * the wire it's an object keyed by template name, so we override that field.
 */
export type CdsHookRequest = Omit<CDSHooksRequest, "prefetch" | "context"> & {
  context: { userId?: string; patientId: string; [key: string]: unknown };
  prefetch?: PatientViewPrefetch;
};

/** The CDS Hooks `indicator` field. Generated as `string`; narrowed here. */
export type CdsIndicator = "info" | "warning" | "critical";

export type CdsCardSource = CDSHooksResponseCardsSource;

export type CdsCard = Omit<CDSHooksResponseCards, "indicator"> & {
  indicator: CdsIndicator;
};

export type CdsResponse = Omit<CDSHooksResponse, "cards"> & {
  cards: CdsCard[];
};

export type CdsDiscovery = CDSHooksServices;
