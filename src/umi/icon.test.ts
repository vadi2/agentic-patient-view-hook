import { describe, expect, test } from "bun:test";
import {
  compositeKey,
  fieldsForState,
  getUmiPng,
  NEUTRAL_KEY,
  umiIndicator,
} from "./icon";
import { EMPTY_STATE, findingsToState, type UmiState } from "./types";

const state = (p: Partial<UmiState>): UmiState => ({ ...EMPTY_STATE, ...p });

describe("fieldsForState", () => {
  test("maps each category to its national-symbol field", () => {
    expect([...fieldsForState(state({ medical: true }))]).toEqual(["F2"]);
    expect([...fieldsForState(state({ infection: true }))]).toEqual(["F5"]);
    expect([...fieldsForState(state({ careRoutine: true }))]).toEqual(["F3"]);
    expect([...fieldsForState(state({ unstructured: true }))]).toEqual(["F6"]);
  });

  test("hypersensitivity severity lights 1/2/3 centre fields", () => {
    expect(
      [...fieldsForState(state({ hypersensitivity: "discomforting" }))].sort(),
    ).toEqual(["F4"]);
    expect(
      [...fieldsForState(state({ hypersensitivity: "harmful" }))].sort(),
    ).toEqual(["F0", "F4"]);
    expect(
      [
        ...fieldsForState(state({ hypersensitivity: "life-threatening" })),
      ].sort(),
    ).toEqual(["F0", "F1", "F4"]);
  });
});

describe("compositeKey", () => {
  test("is deterministic and content-stable", () => {
    const s = state({ medical: true, hypersensitivity: "harmful" });
    expect(compositeKey(s)).toBe("m1i0d0e0-charmful");
    expect(compositeKey(s)).toBe(compositeKey({ ...s }));
    expect(NEUTRAL_KEY).toBe("m0i0d0e0-cnone");
  });
});

describe("umiIndicator", () => {
  test("life-threatening -> critical, any active -> warning, none -> info", () => {
    expect(umiIndicator(state({ hypersensitivity: "life-threatening" }))).toBe(
      "critical",
    );
    expect(umiIndicator(state({ infection: true }))).toBe("warning");
    expect(umiIndicator(state({ hypersensitivity: "discomforting" }))).toBe(
      "warning",
    );
    expect(umiIndicator(EMPTY_STATE)).toBe("info");
  });
});

describe("getUmiPng (prerendered)", () => {
  test("neutral and a composite state are valid distinct 100x100 PNGs", () => {
    const neutral = getUmiPng(NEUTRAL_KEY);
    const composite = getUmiPng(
      compositeKey(
        findingsToState([
          {
            category: "hypersensitivity",
            severity: "life-threatening",
            summary: "x",
            detail: "",
          },
          { category: "infection", summary: "y", detail: "" },
        ]),
      ),
    );
    expect(neutral).toBeInstanceOf(Uint8Array);
    expect(composite).toBeInstanceOf(Uint8Array);
    // PNG magic number.
    expect([...neutral!.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(Buffer.compare(Buffer.from(neutral!), Buffer.from(composite!))).not.toBe(
      0,
    );
    expect(getUmiPng("bogus-key")).toBeUndefined();
  });
});
