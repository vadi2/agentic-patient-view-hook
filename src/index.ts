import { handlePatientView } from "./cds/patient-view";
import { discovery } from "./cds/discovery";
import { assertConfigured, config } from "./config";
import type { CdsHookRequest } from "./fhir/types";
import { getUmiPng, NEUTRAL_KEY } from "./umi/icon";

assertConfigured();

// CDS Hooks clients (EHRs and the sandbox at sandbox.cds-hooks.org) call this
// service cross-origin from the browser, so every response - including the
// preflight - must carry permissive CORS headers.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });

// Icons are deterministic and content-stable (keyed by UMI classification,
// never patient data), so they are safely immutable-cacheable.
const png = (bytes: Uint8Array) =>
  new Response(bytes, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400, immutable",
      ...CORS_HEADERS,
    },
  });

const server = Bun.serve({
  port: config.port,
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight - the browser sends this before the discovery GET and the
    // service POST. Answer it for every path so neither is blocked.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // CDS Hooks discovery endpoint.
    if (request.method === "GET" && url.pathname === "/cds-services") {
      return json(discovery);
    }

    // Neutral brand/fallback glyph (used by no-data and fail-soft cards).
    if (request.method === "GET" && url.pathname === "/icon.png") {
      return png(getUmiPng(NEUTRAL_KEY)!);
    }

    // Composite national-symbol glyph referenced by cards[].source.icon, e.g.
    // /umi/m1i0d1e0-charmful.png
    if (request.method === "GET" && url.pathname.startsWith("/umi/")) {
      const file = url.pathname.slice("/umi/".length);
      if (file.endsWith(".png")) {
        const bytes = getUmiPng(decodeURIComponent(file.slice(0, -4)));
        if (bytes) return png(bytes);
      }
      return json({ error: "Unknown icon" }, 404);
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
console.log(`  UMI icons:  GET  /umi/{compositeKey}.png`);
