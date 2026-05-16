import { APIBuilder, prettyReport } from "@atomic-ehr/codegen";

// Tree-shaken to just the R4 resources the CDS Hooks prefetch references
// (see src/cds/discovery.ts) plus Bundle / OperationOutcome envelopes.
const builder = new APIBuilder()
  .throwException()
  .fromPackage("hl7.fhir.r4.core", "4.0.1")
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
    },
  })
  .outputTo("./src/fhir-types")
  .cleanOutput(true);

const report = await builder.generate();
console.log(prettyReport(report));
if (!report.success) process.exit(1);
