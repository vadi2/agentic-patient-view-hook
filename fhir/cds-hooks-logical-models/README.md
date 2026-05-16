# CDS Hooks logical models (vendored)

These StructureDefinitions feed `scripts/generate-types.ts`. They're vendored
rather than fetched from a published package because of three quirks in the
upstream packaging:

1. The cds-hooks IG (`hl7.fhir.uv.cds-hooks`) does not ship its
   StructureDefinitions in its npm release - only the build artifacts at
   <https://build.fhir.org/ig/HL7/cds-hooks/> contain them.
2. The cds-hooks SDs reference parent types (`CDSHooksElement`,
   `CDSHooksExtensions`) from a different canonical namespace -
   `http://hl7.org/fhir/tools/StructureDefinition/...` - which is defined
   in `hl7.fhir.uv.tools.r4`. The tools IG also re-publishes
   `CDSHooksRequest`/`Response`/`Services` itself, so we use those copies
   for self-consistency.
3. The logical models are anchored at `http://hl7.org/fhir/StructureDefinition/Base`,
   which is an R5 construct; R4 core does not ship it.

Vendored files:

| File | Source |
| --- | --- |
| `StructureDefinition-CDSHooks{Element,Extensions,Request,Response,Services}.json` | `hl7.fhir.uv.tools.r4` @ `1.1.0` (packages.simplifier.net) |
| `StructureDefinition-Base.json` | R5 core, `https://hl7.org/fhir/R5/base.profile.json` |
| `StructureDefinition-CDSHookContext.json` | Local stub - tools IG references `.../CDSHookContext` but does not define it; the wire shape is hook-specific, so this is an abstract open base. |

Regenerate with `bun run generate-types`.
