export const config = {
  port: Number(process.env.PORT ?? 3000),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
} as const;

export function assertConfigured(): void {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set - see .env.example");
  }
}
