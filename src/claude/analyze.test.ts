import { describe, expect, test } from "bun:test";
import { analyzePrefetch, type QueryRunner } from "./analyze";

// The Agent SDK's `query()` returns an AsyncIterable<SDKMessage>; the only
// message shape our code reads is the terminal `result/success`. The test
// runner yields a single such message with the given text payload.
function fakeRunner(resultText: string): QueryRunner {
  return ((_params: { prompt: string | AsyncIterable<unknown> }) => {
    async function* gen() {
      yield {
        type: "result",
        subtype: "success",
        result: resultText,
      } as unknown;
    }
    return gen() as ReturnType<QueryRunner>;
  }) as QueryRunner;
}

function emptyRunner(): QueryRunner {
  return ((_params: { prompt: string | AsyncIterable<unknown> }) => {
    async function* gen(): AsyncGenerator<unknown> {
      // no messages at all - simulates an agent that ended without success
    }
    return gen() as ReturnType<QueryRunner>;
  }) as QueryRunner;
}

describe("analyzePrefetch", () => {
  test("parses typed UMI findings from the JSON result", async () => {
    const json = JSON.stringify({
      findings: [
        {
          category: "hypersensitivity",
          severity: "life-threatening",
          summary: "Penicillin anaphylaxis",
          detail: "Documented anaphylactic reaction",
        },
        { category: "infection", summary: "MRSA", detail: "Carrier" },
      ],
    });
    const findings = await analyzePrefetch("digest", fakeRunner(json));
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      category: "hypersensitivity",
      severity: "life-threatening",
    });
    expect(findings[1]!.category).toBe("infection");
  });

  test("defaults hypersensitivity severity and drops malformed findings", async () => {
    const json = JSON.stringify({
      findings: [
        { category: "hypersensitivity", summary: "Latex", detail: "" },
        { category: "not-a-category", summary: "junk", detail: "x" },
        { category: "medical", detail: "missing summary" },
      ],
    });
    const findings = await analyzePrefetch("digest", fakeRunner(json));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: "hypersensitivity",
      severity: "discomforting",
    });
  });

  test("empty findings array is valid (no UMI)", async () => {
    const json = JSON.stringify({ findings: [] });
    expect(await analyzePrefetch("digest", fakeRunner(json))).toEqual([]);
  });

  test("tolerates a stray prose line around the JSON object", async () => {
    const wrapped =
      "Here is the report:\n" + JSON.stringify({ findings: [] }) + "\nDone.";
    expect(await analyzePrefetch("digest", fakeRunner(wrapped))).toEqual([]);
  });

  test("throws when the agent ends with no successful result", async () => {
    await expect(analyzePrefetch("digest", emptyRunner())).rejects.toThrow(
      /ended without a successful result/,
    );
  });

  test("throws when the result contains no JSON object", async () => {
    await expect(
      analyzePrefetch("digest", fakeRunner("I cannot help with this.")),
    ).rejects.toThrow(/no JSON object/);
  });
});
