/**
 * screen_sanctions must pass entity type and birth year through to the API
 * (added 2026-09-27 after "S W Miles & Company Limited" came back "confirmed"
 * against PEP individuals). The API is camelCase; the tool is snake_case.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NORDIC_API_KEY ??= "test-key";
const { tools } = await import("../src/tools/index.js");
const tool = tools.find((t) => t.name === "screen_sanctions")!;

async function sentBody(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const realFetch = globalThis.fetch;
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ total: 0, results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await tool.handler(args);
  } finally {
    globalThis.fetch = realFetch;
  }
  return body;
}

test("plain names are sent unchanged, min_score as minScore", async () => {
  const b = await sentBody({ names: ["Carlsberg A/S"], min_score: 0.9 });
  assert.deepEqual(b.names, ["Carlsberg A/S"]);
  assert.equal(b.minScore, 0.9);
  assert.equal("min_score" in b, false);
  assert.equal("entityType" in b, false);
});

test("top-level entity_type / birth_year map to entityType / birthYear", async () => {
  const b = await sentBody({ names: ["Søren Jensen"], entity_type: "person", birth_year: 1987 });
  assert.equal(b.entityType, "person");
  assert.equal(b.birthYear, 1987);
});

test("per-name objects map to the API's { name, entityType, birthYear }", async () => {
  const b = await sentBody({
    names: [
      { name: "S W Miles & Company Limited", entity_type: "company" },
      { name: "Søren Jensen", entity_type: "person", birth_year: 1987 },
      "Plain Name",
    ],
  });
  assert.deepEqual(b.names, [
    { name: "S W Miles & Company Limited", entityType: "company" },
    { name: "Søren Jensen", entityType: "person", birthYear: 1987 },
    "Plain Name",
  ]);
});

test("invalid entity_type is rejected before any call", async () => {
  await assert.rejects(() => sentBody({ names: ["X Ltd"], entity_type: "organisation" }));
});

test("the advertised JSON schema exposes the new arguments", () => {
  const props = tool.jsonSchema.properties as Record<string, unknown>;
  assert.ok(props.entity_type);
  assert.ok(props.birth_year);
});
