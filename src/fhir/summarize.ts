// Flattens a patient-view prefetch into a compact, sectioned plaintext digest
// so Claude reasons over clinical facts instead of raw FHIR JSON (smaller,
// cheaper, less noise). All field access is optional-chained against the
// generated R4 types - real EHRs omit and vary fields freely.
import type {
  Bundle,
  Condition,
  DiagnosticReport,
  DocumentReference,
  ImagingStudy,
  MedicationRequest,
  Observation,
  PatientViewPrefetch,
  Resource,
} from "./types";

/** Max items rendered per section, to bound token cost. */
const MAX_PER_SECTION = 50;
/** Hard cap on the whole digest. */
const MAX_CHARS = 12_000;

type Coding = { system?: string; code?: string; display?: string };
type CodeableConcept = { text?: string; coding?: Coding[] };

/**
 * Resources out of a search-set Bundle. Tolerates a bare resource arriving
 * where the type says `Bundle<T>` (real EHR variance) and skips
 * `OperationOutcome` placeholders that some servers put in search sets.
 */
export function bundleResources<T extends Resource>(
  b?: Bundle<T> | T,
): T[] {
  if (!b) return [];
  const asBundle = b as Bundle<T>;
  if (asBundle.resourceType === "Bundle") {
    const entries = asBundle.entry ?? [];
    return entries.flatMap((e) =>
      e?.resource && e.resource.resourceType !== "OperationOutcome"
        ? [e.resource]
        : [],
    );
  }
  const bare = b as T;
  return bare.resourceType !== "OperationOutcome" ? [bare] : [];
}

function cc(concept?: CodeableConcept): string | undefined {
  return (
    concept?.text ??
    concept?.coding?.[0]?.display ??
    concept?.coding?.[0]?.code
  );
}

function day(date?: string): string | undefined {
  return date?.slice(0, 10);
}

function ageFrom(birthDate?: string): string | undefined {
  if (!birthDate) return undefined;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return `${age}y`;
}

const ABNORMAL_CODES = new Set([
  "H",
  "HH",
  "HU",
  "L",
  "LL",
  "LU",
  "A",
  "AA",
]);

function isAbnormal(obs: Observation): boolean {
  const interps = (obs.interpretation as CodeableConcept[] | undefined) ?? [];
  return interps.some((i) =>
    (i.coding ?? []).some(
      (c) => c.code != null && ABNORMAL_CODES.has(c.code.toUpperCase()),
    ),
  );
}

function obsValue(obs: Observation): string | undefined {
  const q = obs.valueQuantity as { value?: number; unit?: string } | undefined;
  if (q?.value != null) return `${q.value}${q.unit ? " " + q.unit : ""}`;
  const vcc = cc(obs.valueCodeableConcept as CodeableConcept | undefined);
  if (vcc) return vcc;
  const s = obs.valueString as string | undefined;
  return s ?? undefined;
}

function joinParts(parts: Array<string | undefined>): string {
  return parts.filter((p): p is string => !!p && p.length > 0).join(" | ");
}

function section(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  const shown = lines.slice(0, MAX_PER_SECTION);
  const more =
    lines.length > MAX_PER_SECTION
      ? `\n  ...(${lines.length - MAX_PER_SECTION} more)`
      : "";
  return `## ${title}\n${shown.map((l) => `- ${l}`).join("\n")}${more}`;
}

function summarizeObservations(obs: Observation[]): string[] {
  // Abnormal results first so the headline alert is easy to spot.
  const ordered = [...obs].sort(
    (a, b) => Number(isAbnormal(b)) - Number(isAbnormal(a)),
  );
  return ordered.map((o) => {
    const interp = cc(
      (o.interpretation as CodeableConcept[] | undefined)?.[0],
    );
    return joinParts([
      cc(o.code as CodeableConcept | undefined),
      obsValue(o),
      interp ? `interpretation: ${interp}` : undefined,
      isAbnormal(o) ? "ABNORMAL" : undefined,
      day(o.effectiveDateTime as string | undefined),
    ]);
  });
}

/**
 * Builds the digest. `hasData` is false only when no clinical resources exist
 * across any key (patient-only or all-empty bundles count as no data) so the
 * handler can skip the Claude call.
 */
export function summarizePrefetch(prefetch?: PatientViewPrefetch): {
  text: string;
  hasData: boolean;
} {
  const p = prefetch ?? {};

  const conditions = bundleResources<Condition>(p.conditions);
  const meds = bundleResources<MedicationRequest>(p.medications);
  const labs = bundleResources<Observation>(p.labs);
  const vitals = bundleResources<Observation>(p.observations);
  const notes = bundleResources<DocumentReference>(p.notes);
  const imaging = bundleResources<ImagingStudy>(p.imaging);
  const reports = bundleResources<DiagnosticReport>(p.reports);

  const hasData =
    conditions.length > 0 ||
    meds.length > 0 ||
    labs.length > 0 ||
    vitals.length > 0 ||
    notes.length > 0 ||
    imaging.length > 0 ||
    reports.length > 0;

  const sections: string[] = [];

  const patient = p.patient;
  if (patient) {
    const name = (
      patient.name as
        | Array<{ given?: string[]; family?: string }>
        | undefined
    )?.[0];
    const fullName = joinParts([
      name?.given?.join(" "),
      name?.family,
    ]);
    sections.push(
      `## Patient\n- ${joinParts([
        fullName || undefined,
        patient.gender as string | undefined,
        ageFrom(patient.birthDate as string | undefined),
      ]) || "(demographics unavailable)"}`,
    );
  }

  sections.push(
    section(
      "Conditions",
      conditions.map((c) =>
        joinParts([
          cc(c.code as CodeableConcept | undefined),
          cc(c.clinicalStatus as CodeableConcept | undefined),
          cc(c.severity as CodeableConcept | undefined),
          day(c.onsetDateTime as string | undefined),
        ]),
      ),
    ),
  );

  sections.push(
    section(
      "Medications",
      meds.map((m) => {
        const med =
          cc(m.medicationCodeableConcept as CodeableConcept | undefined) ??
          (m.medicationReference as { display?: string } | undefined)
            ?.display;
        const dosage = (
          m.dosageInstruction as Array<{ text?: string }> | undefined
        )?.[0]?.text;
        return joinParts([
          med,
          m.status as string | undefined,
          dosage,
          day(m.authoredOn as string | undefined),
        ]);
      }),
    ),
  );

  sections.push(section("Labs", summarizeObservations(labs)));
  sections.push(section("Vitals / Observations", summarizeObservations(vitals)));

  sections.push(
    section(
      "Notes",
      notes.map((n) =>
        joinParts([
          cc(n.type as CodeableConcept | undefined),
          n.description as string | undefined,
          day(n.date as string | undefined),
        ]),
      ),
    ),
  );

  sections.push(
    section(
      "Imaging",
      imaging.map((s) => {
        const modality = (s.modality as Coding[] | undefined)
          ?.map((c) => c.code ?? c.display)
          .filter(Boolean)
          .join(", ");
        const counts = joinParts([
          s.numberOfSeries != null
            ? `${s.numberOfSeries} series`
            : undefined,
          s.numberOfInstances != null
            ? `${s.numberOfInstances} images`
            : undefined,
        ]);
        return joinParts([
          modality || undefined,
          s.description as string | undefined,
          counts || undefined,
          day(s.started as string | undefined),
        ]);
      }),
    ),
  );

  sections.push(
    section(
      "Reports",
      reports.map((r) =>
        joinParts([
          cc(r.code as CodeableConcept | undefined),
          r.status as string | undefined,
          (r.conclusion as string | undefined) ??
            cc(
              (r.conclusionCode as CodeableConcept[] | undefined)?.[0],
            ),
          day(r.effectiveDateTime as string | undefined),
        ]),
      ),
    ),
  );

  const text = sections
    .filter((s) => s.length > 0)
    .join("\n\n")
    .slice(0, MAX_CHARS);

  return { text, hasData };
}
