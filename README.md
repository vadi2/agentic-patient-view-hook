# agentic-patient-view-hook

A [CDS Hooks](https://cds-hooks.org/) `patient-view` service that receives a
patient prefetch (conditions, medications, labs, notes, imaging, lab reports and
observations), analyzes it with the Claude SDK, and returns a single
**Uppmärksamhetsinformation** patient safety alert as an icon card via
`cards[].source.icon`.

> Scaffold status: this is a minimal, working skeleton committed so the project
> is non-empty. Architecture, FHIR fidelity, prompt design, auth and tests are
> intended to be planned next (e.g. via `/ultraplan`).

## Stack

- Runtime: [Bun](https://bun.sh/)
- Language: TypeScript
- LLM: `@anthropic-ai/sdk` (prompt caching on the system instructions)

## Setup

```sh
bun install
bun run generate-types   # writes src/fhir-types/ (gitignored)
cp .env.example .env     # then set ANTHROPIC_API_KEY
bun run dev
```

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

## Request flow

1. EHR fires `patient-view` and delivers the configured prefetch.
2. `handlePatientView` forwards the prefetch to Claude (`src/claude/analyze.ts`).
3. Claude returns a verdict that becomes one CDS card with an alert icon.

## Layout

```
src/
  index.ts            Bun HTTP server + routing
  config.ts           env config
  cds/discovery.ts    CDS Hooks discovery + prefetch templates
  cds/patient-view.ts patient-view handler
  claude/analyze.ts   Claude SDK call + verdict parsing
  fhir/types.ts       prefetch + CDS Hooks shapes (re-exports generated)
  fhir-types/         generated FHIR R4 + CDS Hooks types (gitignored)
fhir/
  cds-hooks-logical-models/  vendored CDS Hooks SDs (input to codegen)
scripts/
  generate-types.ts   @atomic-ehr/codegen builder
```

## Known scaffold gaps

- No FHIR fallback fetch when prefetch is absent.
- No auth (CDS Hooks JWT), rate limiting, retries or tests yet.
- Icon points at a placeholder; the real Uppmärksamhetsinformation glyph is TBD.
