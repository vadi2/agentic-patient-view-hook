import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "bun:test";
import { analyzePrefetch } from "./analyze";

function toolUseMessage(
  input: Record<string, unknown>,
): Anthropic.Message {
  return {
    content: [{ type: "tool_use", id: "t1", name: "report_umi", input }],
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
  test("returns typed UMI findings from the tool_use block", async () => {
    const { client } = fakeClient([
      toolUseMessage({
        findings: [
          {
            category: "hypersensitivity",
            severity: "life-threatening",
            summary: "Penicillin anaphylaxis",
            detail: "Documented anaphylactic reaction",
          },
          { category: "infection", summary: "MRSA", detail: "Carrier" },
        ],
      }),
    ]);
    const findings = await analyzePrefetch("digest", client);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      category: "hypersensitivity",
      severity: "life-threatening",
    });
    expect(findings[1]!.category).toBe("infection");
  });

  test("defaults hypersensitivity severity and drops malformed findings", async () => {
    const { client } = fakeClient([
      toolUseMessage({
        findings: [
          { category: "hypersensitivity", summary: "Latex", detail: "" },
          { category: "not-a-category", summary: "junk", detail: "x" },
          { category: "medical", detail: "missing summary" },
        ],
      }),
    ]);
    const findings = await analyzePrefetch("digest", client);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: "hypersensitivity",
      severity: "discomforting",
    });
  });

  test("empty findings array is valid (no UMI)", async () => {
    const { client } = fakeClient([toolUseMessage({ findings: [] })]);
    expect(await analyzePrefetch("digest", client)).toEqual([]);
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
          findings: [
            { category: "medical", summary: "Aortic stent", detail: "Implant" },
          ],
        }),
      ]);
      const findings = await analyzePrefetch("digest", client);
      expect(findings[0]!.category).toBe("medical");
      expect(calls()).toBe(2);
    },
    10_000,
  );
});
