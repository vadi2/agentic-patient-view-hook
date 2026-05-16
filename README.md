# agentic-patient-view-hook

A [CDS Hooks](https://cds-hooks.org/) `patient-view` service that receives a
patient prefetch (conditions, medications, labs, notes, imaging, lab reports and
observations), analyzes it with the Claude SDK, and returns a single
**Uppmärksamhetsinformation** patient safety alert as an icon card via
`cards[].source.icon`.

## Stack

- Runtime: [Bun](https://bun.sh/)
- Language: TypeScript
- LLM: `@anthropic-ai/sdk` (prompt caching on the system instructions, tool-use
  structured output)

## Setup

```sh
bun install
bun run generate-types   # writes src/fhir-types/ (gitignored)
cp .env.example .env     # then set ANTHROPIC_API_KEY
bun run dev
```

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
| GET    | `/icon.png`                           | Service-hosted alert glyph (`source.icon`) |

## Request flow

1. EHR fires `patient-view` and delivers the configured prefetch.
2. `summarizePrefetch` (`src/fhir/summarize.ts`) flattens the prefetch into a
   compact sectioned clinical digest. No clinical data -> a benign info card is
   returned without calling Claude.
3. `analyzePrefetch` (`src/claude/analyze.ts`) sends the digest to Claude, which
   must return the alert via the `report_uppmarksamhetsinformation` tool
   (structured output, no string parsing); transient SDK errors are retried.
4. The verdict becomes one CDS card whose `source.icon` points at
   `${PUBLIC_BASE_URL}/icon.png`.
5. Any analysis failure degrades to a single non-blocking info card - the
   service never breaks the EHR chart view.

## Layout

```
src/
  index.ts            Bun HTTP server + routing (+ /icon.png)
  config.ts           env config (incl. publicBaseUrl)
  cds/discovery.ts    CDS Hooks discovery + prefetch templates
  cds/patient-view.ts fail-soft patient-view handler
  claude/analyze.ts   Claude tool-use call + retry
  fhir/summarize.ts   prefetch -> compact clinical digest
  fhir/types.ts       prefetch + CDS Hooks shapes (re-exports generated)
  fhir-types/         generated FHIR R4 + CDS Hooks types (gitignored)
  assets/icon.png     Uppmärksamhetsinformation glyph (100x100 PNG)
  **/*.test.ts        bun test suites
fhir/
  cds-hooks-logical-models/  vendored CDS Hooks SDs (input to codegen)
scripts/
  generate-types.ts   @atomic-ehr/codegen builder
```

## Behaviour & current limits

- The handler **fails soft**: absent/empty prefetch and any Claude error both
  return a single non-blocking info card, never an HTTP 500 to the EHR.
- Claude output is enforced via tool use, not string parsing; transient
  429/5xx/connection errors are retried (2s, 4s backoff).
- The icon is a service-hosted 100x100 PNG; swap `src/assets/icon.png` for the
  organisation's official Uppmärksamhetsinformation glyph when available.

### Future work

- No FHIR fallback fetch when a prefetch template is unfulfilled.
- No CDS Hooks JWT auth or rate limiting.
