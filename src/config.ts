const port = Number(process.env.PORT ?? 3000);

export const config = {
  port,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
  // Absolute base used to build the card's source.icon URL so the EHR can
  // fetch the service-hosted glyph.
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
} as const;

export function assertConfigured(): void {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set - see .env.example");
  }
}
