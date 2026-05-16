import { analyzePrefetch } from "../claude/analyze";
import type { CdsHookRequest, CdsResponse } from "../fhir/types";

export async function handlePatientView(
  req: CdsHookRequest,
): Promise<CdsResponse> {
  if (req.hook !== "patient-view") {
    throw new Error(`Unsupported hook: ${req.hook}`);
  }
  if (!req.prefetch) {
    // Without prefetch the service would have to call back to the FHIR server;
    // that fetch path is out of scope for the scaffold.
    throw new Error("Request is missing prefetch - none configured to fetch");
  }

  const card = await analyzePrefetch(req.prefetch);
  return { cards: [card] };
}
