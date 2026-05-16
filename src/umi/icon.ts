import { Resvg } from "@resvg/resvg-js";
import type { CdsIndicator } from "../fhir/types";
import {
  UMI_SEVERITIES,
  type UmiSeverity,
  type UmiState,
} from "./types";

// The seven addressable regions of the national symbol (data-field 0-6 in the
// HL7 Sweden reference rendering). F0 stripes / F1 top bar / F4 dot form the
// central hypersensitivity exclamation; F2/F3/F5/F6 are the wedge arms.
type Field = "F0" | "F1" | "F2" | "F3" | "F4" | "F5" | "F6";
const ALL_FIELDS: Field[] = ["F0", "F1", "F2", "F3", "F4", "F5", "F6"];

// Fixed colour per region (not per severity) - from Socialstyrelsen spec /
// HL7 Sweden demo `UMI_SVG.colors`.
const FIELD_COLOR: Record<Field, string> = {
  F0: "#B60606", // hypersensitivity (stripes)
  F1: "#B60606", // hypersensitivity (top bar)
  F4: "#B60606", // hypersensitivity (dot)
  F2: "#B60606", // medical conditions & treatments (NE)
  F3: "#05598A", // special care routine (SE)
  F5: "#E1A100", // infection (SW)
  F6: "#B60606", // unstructured alert information (NW)
};
// Demo uses #ffffff for "off" because the symbol sits on a coloured tile; for a
// standalone EHR card icon use a light grey so unlit regions read as inactive.
const INACTIVE = "#D4D7DB";
const BODY = "#ffffff";

/** Which regions light up for a given composite state. */
export function fieldsForState(state: UmiState): Set<Field> {
  const on = new Set<Field>();
  if (state.medical) on.add("F2");
  if (state.infection) on.add("F5");
  if (state.careRoutine) on.add("F3");
  if (state.unstructured) on.add("F6");
  switch (state.hypersensitivity) {
    case "life-threatening":
      on.add("F1");
      on.add("F0");
      on.add("F4");
      break;
    case "harmful":
      on.add("F0");
      on.add("F4");
      break;
    case "discomforting":
      on.add("F4");
      break;
    case "none":
      break;
  }
  return on;
}

const b = (v: boolean) => (v ? "1" : "0");

/** Deterministic, content-stable key (no patient data) for the URL/cache. */
export function compositeKey(state: UmiState): string {
  return `m${b(state.medical)}i${b(state.infection)}d${b(
    state.careRoutine,
  )}e${b(state.unstructured)}-c${state.hypersensitivity}`;
}

export const NEUTRAL_KEY = compositeKey({
  medical: false,
  infection: false,
  careRoutine: false,
  unstructured: false,
  hypersensitivity: "none",
});

export function umiIndicator(state: UmiState): CdsIndicator {
  if (state.hypersensitivity === "life-threatening") return "critical";
  if (
    state.medical ||
    state.infection ||
    state.careRoutine ||
    state.unstructured ||
    state.hypersensitivity !== "none"
  ) {
    return "warning";
  }
  return "info";
}

const template = await Bun.file(
  new URL("../assets/umi/symbol.svg", import.meta.url),
).text();

function rasterize(state: UmiState): Uint8Array {
  const on = fieldsForState(state);
  let svg = template.replaceAll("{{BODY}}", BODY);
  for (const f of ALL_FIELDS) {
    svg = svg.replaceAll(`{{${f}}}`, on.has(f) ? FIELD_COLOR[f] : INACTIVE);
  }
  return new Resvg(svg, { fitTo: { mode: "width", value: 100 } })
    .render()
    .asPng();
}

// Finite state space (2^4 region combinations x 4 hypersensitivity levels = 64)
// pre-rendered once at startup. Same classification -> byte-identical PNG, so
// the URL is content-stable and safely immutable-cacheable.
const cache = new Map<string, Uint8Array>();
const HS_STATES: Array<UmiSeverity | "none"> = ["none", ...UMI_SEVERITIES];

for (const medical of [false, true]) {
  for (const infection of [false, true]) {
    for (const careRoutine of [false, true]) {
      for (const unstructured of [false, true]) {
        for (const hypersensitivity of HS_STATES) {
          const state: UmiState = {
            medical,
            infection,
            careRoutine,
            unstructured,
            hypersensitivity,
          };
          cache.set(compositeKey(state), rasterize(state));
        }
      }
    }
  }
}

export function getUmiPng(key: string): Uint8Array | undefined {
  return cache.get(key);
}
