# agentic-patient-view-hook

A [CDS Hooks](https://cds-hooks.org/) `patient-view` service that receives a
patient prefetch (conditions, medications, labs, notes, imaging, lab reports and
observations), analyzes it with the Claude SDK, classifies the findings into the
five Socialstyrelsen **Uppmärksamhetsinformation** (UMI) categories, and returns
**one composite card** whose `cards[].source.icon` is the national UMI symbol
rendered for that patient.

> **Attribution / IP:** the "uppmärksamhetssymbol" is artwork from the
> Socialstyrelsen UMI information specification (`2022-6-8059`, v5.1). The
> geometry mirrors the HL7 Sweden reference rendering
> (https://demo.umi.infopeak.se). Production use may require Socialstyrelsen
> permission; `src/assets/umi/symbol.svg` is a single replaceable asset.

## Stack

- Runtime: [Bun](https://bun.sh/)
- Language: TypeScript
- LLM: `@anthropic-ai/claude-agent-sdk` driving a local agent with no tools
  (`allowedTools: []`); structured output is enforced by a JSON-only system
  prompt, parsed defensively on the way out

## Setup

```sh
bun install
bun run generate-types   # writes src/fhir-types/ (gitignored)
bun run dev
```

### Prerequisites

- [Bun](https://bun.sh/) 1.3+ for the runtime, server, and package manager.
- [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) installed and
  logged in (`claude login`). The Agent SDK shells out to your local
  `claude` binary - no `ANTHROPIC_API_KEY` is required. (The SDK does still
  honour `ANTHROPIC_API_KEY` if you'd rather use a raw key; see
  `.env.example`.)

`bun test` does **not** require `bun run generate-types` - the `fhir-types`
imports are type-only and erased at runtime.

FHIR types are produced by [`@atomic-ehr/codegen`](https://github.com/atomic-ehr/codegen)
from the prefetched R4 resources listed in `scripts/generate-types.ts`. The
CDS Hooks request/response/discovery envelope shapes are generated from the
logical models in `hl7.fhir.uv.tools.r4` (vendored under
`fhir/cds-hooks-logical-models/` - see the README there for why). Re-run
`bun run generate-types` whenever those lists change.

## Endpoints

| Method | Path                                  | Purpose                       |
| ------ | ------------------------------------- | ----------------------------- |
| GET    | `/cds-services`                       | CDS Hooks discovery document  |
| POST   | `/cds-services/agentic-patient-view`  | `patient-view` hook invocation |
| GET    | `/icon.png`                           | Neutral (inactive) UMI symbol |
| GET    | `/umi/{compositeKey}.png`             | Composite UMI symbol (`source.icon`) |

## The UMI symbol

The national symbol is **one composite badge** (16-point star, central
exclamation, four wedge arms). Each region lights up iff that UMI category is
active; the central exclamation encodes hypersensitivity severity (1/2/3 fields
for discomforting/harmful/life-threatening). Colours are fixed per region
(medical/hypersensitivity/unstructured red, infection amber, care-routine blue;
inactive grey). The icon is keyed by classification only (no patient data), so
the finite state space (2⁴ × 4 = 64) is pre-rendered at startup and served
immutable-cacheable.

## Request flow

1. EHR fires `patient-view` and delivers the configured prefetch.
2. `summarizePrefetch` (`src/fhir/summarize.ts`) flattens the prefetch into a
   compact sectioned clinical digest. No clinical data -> a benign info card is
   returned without calling Claude.
3. `analyzePrefetch` (`src/claude/analyze.ts`) hands the digest to a local
   agent via `query()` from `@anthropic-ai/claude-agent-sdk` with
   `allowedTools: []` - the agent has no filesystem or bash access, only the
   prompt. Claude is instructed to emit a single JSON object; the handler
   parses defensively (extracts the first `{...}` block) and drops any
   malformed finding.
4. Findings fold into one composite `UmiState`; the handler emits a single card
   whose `source.icon` is `${PUBLIC_BASE_URL}/umi/{compositeKey}.png` and whose
   `indicator` is derived from the state.
5. Any analysis failure (or no UMI) degrades to a single non-blocking neutral
   card - the service never breaks the EHR chart view.

## Layout

```
src/
  index.ts            Bun HTTP server + routing (+ /icon.png, /umi/*.png)
  config.ts           env config (incl. publicBaseUrl)
  cds/discovery.ts    CDS Hooks discovery + prefetch templates
  cds/patient-view.ts fail-soft handler -> one composite UMI card
  claude/analyze.ts   Claude Agent SDK query() with no tools + JSON parse
  fhir/summarize.ts   prefetch -> compact clinical digest
  fhir/types.ts       prefetch + CDS Hooks shapes (re-exports generated)
  fhir-types/         generated FHIR R4 + CDS Hooks types (gitignored)
  umi/types.ts        UMI categories, UmiState, findings -> state
  umi/icon.ts         composite-state SVG fill + resvg prerender
  assets/umi/symbol.svg  tokenised national symbol (9 paths)
  **/*.test.ts        bun test suites
fhir/
  cds-hooks-logical-models/  vendored CDS Hooks SDs (input to codegen)
scripts/
  generate-types.ts   @atomic-ehr/codegen builder
```

## Behaviour & current limits

- The handler **fails soft**: absent/empty prefetch and any Claude error both
  return a single non-blocking info card, never an HTTP 500 to the EHR.
- Claude output is enforced via a JSON-only system prompt; the parser
  extracts the first `{...}` block and drops malformed findings rather than
  failing the whole response. The Agent SDK handles transport-level retries
  internally.
- Icons are 100x100 PNGs pre-rendered from `src/assets/umi/symbol.svg`; replace
  that single asset with the licensed official artwork for production.
- UMI here is LLM-derived **decision support**, not the authoritative regulated
  Socialstyrelsen record (cards are labelled accordingly).

### Future work

- No FHIR fallback fetch when a prefetch template is unfulfilled.
- No CDS Hooks JWT auth or rate limiting.
