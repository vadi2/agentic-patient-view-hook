import { APIBuilder, prettyReport } from "@atomic-ehr/codegen";

// Tree-shaken to just the R4 resources the CDS Hooks prefetch references
// (see src/cds/discovery.ts) plus Bundle / OperationOutcome envelopes.
//
// CDS Hooks request/response/discovery envelope types come from the logical
// models in the cds-hooks IG. The 3.0.0-ballot npm release omits the
// StructureDefinitions, so the build R4 tgz is vendored at fhir/.
const builder = new APIBuilder()
  .throwException()
  .fromPackage("hl7.fhir.r4.core", "4.0.1")
  // CDS Hooks logical models live in the tools IG. The cds-hooks IG itself
  // (hl7.fhir.uv.cds-hooks) re-exposes them under a different canonical, but
  // its SDs aren't shipped in the 3.0.0-ballot npm release and they reference
  // the tools-IG flavors for Element/Extensions anyway. Base is included as a
  // stub because it's introduced in R5 but the logical models target R4.
  .localStructureDefinitions({
    package: { name: "hl7.fhir.uv.tools.r4", version: "1.1.0" },
    path: "./fhir/cds-hooks-logical-models",
    dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
  })
  .typescript({
    withDebugComment: false,
    generateProfile: true,
    openResourceTypeSet: false,
  })
  .typeSchema({
    treeShake: {
      "hl7.fhir.r4.core": {
        "http://hl7.org/fhir/StructureDefinition/Patient": {},
        "http://hl7.org/fhir/StructureDefinition/Condition": {},
        "http://hl7.org/fhir/StructureDefinition/MedicationRequest": {},
        "http://hl7.org/fhir/StructureDefinition/Observation": {},
        "http://hl7.org/fhir/StructureDefinition/DocumentReference": {},
        "http://hl7.org/fhir/StructureDefinition/ImagingStudy": {},
        "http://hl7.org/fhir/StructureDefinition/DiagnosticReport": {},
        "http://hl7.org/fhir/StructureDefinition/Bundle": {},
        "http://hl7.org/fhir/StructureDefinition/OperationOutcome": {},
      },
      "hl7.fhir.uv.tools.r4": {
        "http://hl7.org/fhir/tools/StructureDefinition/CDSHooksRequest": {},
        "http://hl7.org/fhir/tools/StructureDefinition/CDSHooksResponse": {},
        "http://hl7.org/fhir/tools/StructureDefinition/CDSHooksServices": {},
      },
    },
  })
  .outputTo("./src/fhir-types")
  .cleanOutput(true);

const report = await builder.generate();
console.log(prettyReport(report));
if (!report.success) process.exit(1);
