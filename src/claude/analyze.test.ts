import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "bun:test";
import { analyzePrefetch } from "./analyze";

function toolUseMessage(
  input: Record<string, unknown>,
): Anthropic.Message {
  return {
    content: [
      { type: "tool_use", id: "t1", name: "report_uppmarksamhetsinformation", input },
    ],
  } as unknown as Anthropic.Message;
}

// Minimal stand-in for the SDK client: returns/throws the next scripted item.
function fakeClient(steps: Array<Anthropic.Message | Error>): {
  client: Anthropic;
  calls: () => number;
} {
  let i = 0;
  const client = {
    messages: {
      create: async () => {
        const step = steps[Math.min(i, steps.length - 1)];
        i++;
        if (step instanceof Error) throw step;
        return step;
      },
    },
  } as unknown as Anthropic;
  return { client, calls: () => i };
}

describe("analyzePrefetch", () => {
  test("maps a tool_use verdict to a CdsCard", async () => {
    const { client } = fakeClient([
      toolUseMessage({
        summary: "Critical hyperkalemia",
        detail: "K+ 6.8 mmol/L",
        indicator: "critical",
      }),
    ]);
    const card = await analyzePrefetch("digest", client);
    expect(card.summary).toBe("Critical hyperkalemia");
    expect(card.detail).toBe("K+ 6.8 mmol/L");
    expect(card.indicator).toBe("critical");
    expect(card.source.icon?.endsWith("/icon.png")).toBe(true);
  });

  test("throws when no tool_use block is present", async () => {
    const { client } = fakeClient([
      { content: [{ type: "text", text: "no tool here" }] } as unknown as Anthropic.Message,
    ]);
    await expect(analyzePrefetch("digest", client)).rejects.toThrow(
      /no tool_use/,
    );
  });

  test(
    "retries a transient connection error then succeeds",
    async () => {
      const transient = new Anthropic.APIConnectionError({
        message: "socket hang up",
      });
      const { client, calls } = fakeClient([
        transient,
        toolUseMessage({
          summary: "Stable",
          detail: "Nothing urgent",
          indicator: "info",
        }),
      ]);
      const card = await analyzePrefetch("digest", client);
      expect(card.indicator).toBe("info");
      expect(calls()).toBe(2);
    },
    10_000,
  );
});
