const port = Number(process.env.PORT ?? 3000);

// Auth for the Claude Agent SDK is resolved by the SDK itself: it shells out
// to the local `claude` CLI (use `claude login`), or falls back to
// ANTHROPIC_API_KEY if that env var is set. No credential lives here.
export const config = {
  port,
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
  // Absolute base used to build the card's source.icon URL so the EHR can
  // fetch the service-hosted glyph.
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
} as const;
