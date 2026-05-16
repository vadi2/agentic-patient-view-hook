import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { CdsHookRequest } from "../fhir/types";
import type { UmiFinding } from "../umi/types";

// Stub the Claude analyzer so the handler is tested in isolation (no network).
const analyzeMock = mock(async (): Promise<UmiFinding[]> => []);
mock.module("../claude/analyze", () => ({
  analyzePrefetch: analyzeMock,
  defaultClient: {},
}));

const { handlePatientView } = await import("./patient-view");

const baseReq = (prefetch?: unknown): CdsHookRequest =>
  ({
    hook: "patient-view",
    hookInstance: "h1",
    context: { patientId: "123" },
    prefetch,
  }) as unknown as CdsHookRequest;

const conditionPrefetch = {
  conditions: {
    resourceType: "Bundle",
    entry: [{ resource: { resourceType: "Condition", code: { text: "Asthma" } } }],
  },
};

beforeEach(() => {
  analyzeMock.mockClear();
});

describe("handlePatientView", () => {
  test("absent prefetch -> neutral info card, analyzer not called", async () => {
    const res = await handlePatientView(baseReq(undefined));
    expect(res.cards).toHaveLength(1);
    expect(res.cards[0]!.indicator).toBe("info");
    expect(res.cards[0]!.summary).toContain("No clinical data");
    expect(res.cards[0]!.source.icon).toContain("/umi/m0i0d0e0-cnone.png");
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  test("findings -> single composite card with correct icon + indicator", async () => {
    analyzeMock.mockResolvedValueOnce([
      {
        category: "hypersensitivity",
        severity: "life-threatening",
        summary: "Penicillin anaphylaxis",
        detail: "Anaphylactic shock 2021",
      },
      { category: "medical", summary: "Aortic stent", detail: "Implant" },
    ]);
    const res = await handlePatientView(baseReq(conditionPrefetch));
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    expect(res.cards).toHaveLength(1);
    const card = res.cards[0]!;
    expect(card.indicator).toBe("critical");
    expect(card.source.icon).toContain(
      "/umi/m1i0d0e0-clife-threatening.png",
    );
    expect(card.summary).toContain("Hypersensitivity");
    expect(card.detail).toContain("Penicillin anaphylaxis");
  });

  test("no UMI found -> neutral 'no attention information' card", async () => {
    analyzeMock.mockResolvedValueOnce([]);
    const res = await handlePatientView(baseReq(conditionPrefetch));
    expect(res.cards[0]!.indicator).toBe("info");
    expect(res.cards[0]!.summary).toContain("No attention information");
    expect(res.cards[0]!.source.icon).toContain("/umi/m0i0d0e0-cnone.png");
  });

  test("analyzer throws -> fail-soft neutral card, no exception", async () => {
    analyzeMock.mockRejectedValueOnce(new Error("Claude down"));
    const res = await handlePatientView(baseReq(conditionPrefetch));
    expect(res.cards).toHaveLength(1);
    expect(res.cards[0]!.indicator).toBe("info");
    expect(res.cards[0]!.summary).toContain("unavailable");
  });

  test("rejects a non patient-view hook", async () => {
    await expect(
      handlePatientView({ ...baseReq(undefined), hook: "order-sign" }),
    ).rejects.toThrow(/Unsupported hook/);
  });
});
