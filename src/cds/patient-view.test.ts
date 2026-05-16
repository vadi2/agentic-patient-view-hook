import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { CdsCard, CdsHookRequest } from "../fhir/types";

// Stub the Claude analyzer so the handler is tested in isolation (no network).
const analyzeMock = mock(
  async (): Promise<CdsCard> => ({
    summary: "stub",
    detail: "stub",
    indicator: "info",
    source: { label: "x", icon: "http://localhost:3000/icon.png" },
  }),
);
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
  test("absent prefetch -> info card, analyzer not called", async () => {
    const res = await handlePatientView(baseReq(undefined));
    expect(res.cards).toHaveLength(1);
    expect(res.cards[0]!.indicator).toBe("info");
    expect(res.cards[0]!.summary).toContain("No clinical data");
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  test("data present -> analyzer card returned", async () => {
    analyzeMock.mockResolvedValueOnce({
      summary: "Real alert",
      detail: "details",
      indicator: "warning",
      source: { label: "x", icon: "http://localhost:3000/icon.png" },
    });
    const res = await handlePatientView(baseReq(conditionPrefetch));
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    expect(res.cards[0]!.summary).toBe("Real alert");
    expect(res.cards[0]!.indicator).toBe("warning");
  });

  test("analyzer throws -> fail-soft info card, no exception", async () => {
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
