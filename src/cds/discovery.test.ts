import { describe, expect, test } from "bun:test";
import { discovery } from "./discovery";

describe("discovery", () => {
  const service = discovery.services[0]!;

  test("advertises the patient-view service", () => {
    expect(service.hook).toBe("patient-view");
    expect(service.id).toBe("agentic-patient-view");
  });

  test("declares all eight prefetch keys", () => {
    const keys = Object.keys(service.prefetch ?? {}).sort();
    expect(keys).toEqual(
      [
        "conditions",
        "imaging",
        "labs",
        "medications",
        "notes",
        "observations",
        "patient",
        "reports",
      ].sort(),
    );
  });
});
