// Minimal, intentionally loose FHIR shapes - enough to route the prefetch into
// Claude without committing to a full FHIR model in the scaffold.

export interface FhirResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

export interface FhirBundle {
  resourceType: "Bundle";
  entry?: Array<{ resource?: FhirResource }>;
}

/** Each prefetch key maps to a single resource or a search-set Bundle. */
export type PrefetchValue = FhirResource | FhirBundle | undefined;

export interface PatientViewPrefetch {
  patient?: FhirResource;
  conditions?: PrefetchValue;
  medications?: PrefetchValue;
  labs?: PrefetchValue;
  notes?: PrefetchValue;
  imaging?: PrefetchValue;
  reports?: PrefetchValue;
  observations?: PrefetchValue;
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
