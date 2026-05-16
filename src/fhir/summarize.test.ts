import { describe, expect, test } from "bun:test";
import { bundleResources, summarizePrefetch } from "./summarize";
import type { PatientViewPrefetch } from "./types";

// Fixtures are plain wire-shaped objects cast to the prefetch type; the
// generated FHIR types are erased at runtime so structural data is enough.
const bundle = (...resources: unknown[]) =>
  ({ resourceType: "Bundle", entry: resources.map((r) => ({ resource: r })) }) as never;

describe("bundleResources", () => {
  test("extracts resources from a search-set bundle", () => {
    const out = bundleResources(
      bundle({ resourceType: "Condition", id: "a" }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "a" });
  });

  test("skips OperationOutcome placeholders", () => {
    const out = bundleResources(
      bundle(
        { resourceType: "OperationOutcome" },
        { resourceType: "Condition", id: "ok" },
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ resourceType: "Condition" });
  });

  test("tolerates a bare resource instead of a Bundle", () => {
    const out = bundleResources({ resourceType: "Condition", id: "bare" } as never);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "bare" });
  });

  test("returns [] for undefined", () => {
    expect(bundleResources(undefined)).toEqual([]);
  });
});

describe("summarizePrefetch", () => {
  test("absent prefetch -> hasData false", () => {
    const { text, hasData } = summarizePrefetch(undefined);
    expect(hasData).toBe(false);
    expect(text).toBe("");
  });

  test("patient-only / empty bundles -> hasData false", () => {
    const prefetch = {
      patient: { resourceType: "Patient", gender: "female" },
      conditions: { resourceType: "Bundle", entry: [] },
    } as unknown as PatientViewPrefetch;
    const { hasData } = summarizePrefetch(prefetch);
    expect(hasData).toBe(false);
  });

  test("renders conditions, medications and dates", () => {
    const prefetch = {
      conditions: bundle({
        resourceType: "Condition",
        code: { text: "Type 2 diabetes mellitus" },
        clinicalStatus: { coding: [{ code: "active" }] },
        onsetDateTime: "2019-03-04T00:00:00Z",
      }),
      medications: bundle({
        resourceType: "MedicationRequest",
        medicationCodeableConcept: { text: "Metformin 500mg" },
        status: "active",
        dosageInstruction: [{ text: "1 tablet twice daily" }],
        authoredOn: "2020-01-15",
      }),
    } as unknown as PatientViewPrefetch;
    const { text, hasData } = summarizePrefetch(prefetch);
    expect(hasData).toBe(true);
    expect(text).toContain("Type 2 diabetes mellitus");
    expect(text).toContain("2019-03-04");
    expect(text).toContain("Metformin 500mg");
    expect(text).toContain("1 tablet twice daily");
  });

  test("abnormal observations are flagged and listed first", () => {
    const prefetch = {
      labs: bundle(
        {
          resourceType: "Observation",
          code: { text: "Sodium" },
          valueQuantity: { value: 140, unit: "mmol/L" },
        },
        {
          resourceType: "Observation",
          code: { text: "Potassium" },
          valueQuantity: { value: 6.8, unit: "mmol/L" },
          interpretation: [{ coding: [{ code: "HH" }] }],
        },
      ),
    } as unknown as PatientViewPrefetch;
    const { text } = summarizePrefetch(prefetch);
    expect(text).toContain("ABNORMAL");
    expect(text.indexOf("Potassium")).toBeLessThan(text.indexOf("Sodium"));
  });

  test("notes never inline attachment data", () => {
    const prefetch = {
      notes: bundle({
        resourceType: "DocumentReference",
        type: { text: "Discharge summary" },
        date: "2021-06-01",
        description: "Discharge after admission",
        content: [{ attachment: { data: "QkFTRTY0" } }],
      }),
    } as unknown as PatientViewPrefetch;
    const { text } = summarizePrefetch(prefetch);
    expect(text).toContain("Discharge summary");
    expect(text).not.toContain("QkFTRTY0");
  });
});
