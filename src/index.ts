import { handlePatientView } from "./cds/patient-view";
import { discovery } from "./cds/discovery";
import { assertConfigured, config } from "./config";
import type { CdsHookRequest } from "./fhir/types";

assertConfigured();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const server = Bun.serve({
  port: config.port,
  async fetch(request) {
    const url = new URL(request.url);

    // CDS Hooks discovery endpoint.
    if (request.method === "GET" && url.pathname === "/cds-services") {
      return json(discovery);
    }

    // CDS Hooks service invocation.
    if (
      request.method === "POST" &&
      url.pathname === "/cds-services/agentic-patient-view"
    ) {
      let hookRequest: CdsHookRequest;
      try {
        hookRequest = (await request.json()) as CdsHookRequest;
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      try {
        return json(await handlePatientView(hookRequest));
      } catch (err) {
        console.error("patient-view handler failed:", err);
        return json({ error: (err as Error).message }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`CDS Hooks service listening on http://localhost:${server.port}`);
console.log(`  Discovery:  GET  /cds-services`);
console.log(`  Service:    POST /cds-services/agentic-patient-view`);
