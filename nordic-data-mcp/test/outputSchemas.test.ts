/**
 * Regression tests for the curated tools' outputSchemas.
 *
 * Since v1.5.5 every tool with an outputSchema returns structuredContent, and
 * a spec-enforcing MCP client rejects the WHOLE result if a single field
 * breaks the schema. 2026-09-15: validate_vat for a German number returned
 * "Structured content does not match the tool's output schema: data/name must
 * be string" because VIES does not disclose name/address for DE and ES.
 *
 * The fixtures in test/fixtures are real API responses captured from the live
 * API (trimmed). Each one is replayed through a real SDK Server + Client pair,
 * so the client performs exactly the validation that failed in production.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";

// apiClient reads the key at import time — set it before loading the tools.
process.env.NORDIC_API_KEY ??= "test-key";
const { tools } = await import("../src/tools/index.js");
const { dispatchToolCall } = await import("../src/lib/dispatcher.js");

interface Fixture {
  tool: string;
  args: Record<string, unknown>;
  note?: string;
  response: Record<string, unknown>;
}

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixtures = readdirSync(fixtureDir)
  .filter((f) => f.endsWith(".json"))
  .map((file) => ({
    file,
    ...(JSON.parse(readFileSync(join(fixtureDir, file), "utf8")) as Fixture),
  }));

/** Upstream bodies keyed by URL path suffix, for the mocked fetch. */
function upstreamBodies(fx: Fixture): Array<[RegExp, unknown]> {
  // lookup_lei with include_relationships fans out to three endpoints and
  // merges them into { ...primary, relationships: { parent, children } }.
  if (fx.tool === "lookup_lei" && fx.response.relationships) {
    const { relationships, ...primary } = fx.response as {
      relationships: { parent: unknown; children: unknown };
    };
    return [
      [/\/parent$/, relationships.parent],
      [/\/children$/, relationships.children],
      [/.*/, primary],
    ];
  }
  return [[/.*/, fx.response]];
}

async function connectClient(): Promise<Client> {
  const server = new Server(
    { name: "nordic-data-mcp-test", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.jsonSchema,
      ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    dispatchToolCall(request.params.name, request.params.arguments),
  );
  const client = new Client({ name: "strict-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  // Populates the client's per-tool outputSchema validators.
  await client.listTools();
  return client;
}

function mockFetch(bodies: Array<[RegExp, unknown]>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    const body = bodies.find(([re]) => re.test(path))![1];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("fixtures cover every tool that declares an outputSchema", () => {
  const covered = new Set(fixtures.map((f) => f.tool));
  for (const t of tools.filter((t) => t.outputSchema)) {
    assert.ok(covered.has(t.name), `no live-response fixture for ${t.name}`);
  }
});

test("validate_vat: German number with undisclosed name/address is returned as valid", async () => {
  const restore = mockFetch([
    [/.*/, { valid: true, vatNumber: "DE143454214", countryCode: "DE", name: null, address: null, source: "VIES" }],
  ]);
  try {
    const client = await connectClient();
    const result = await client.callTool({
      name: "validate_vat",
      arguments: { country: "DE", vat_number: "143454214" },
    });
    assert.notEqual(result.isError, true);
    assert.equal((result.structuredContent as { valid: boolean }).valid, true);
    await client.close();
  } finally {
    restore();
  }
});

for (const fx of fixtures) {
  test(`strict client accepts live response: ${fx.file}`, async () => {
    const restore = mockFetch(upstreamBodies(fx));
    try {
      const client = await connectClient();
      const result = await client.callTool({ name: fx.tool, arguments: fx.args });
      assert.notEqual(result.isError, true, JSON.stringify(result.content));
      assert.deepEqual(result.structuredContent, fx.response);
      await client.close();
    } finally {
      restore();
    }
  });
}

test("the harness catches a non-nullable field (guards against a vacuous pass)", () => {
  const vat = tools.find((t) => t.name === "validate_vat")!;
  const strict = structuredClone(vat.outputSchema!) as {
    properties: Record<string, { type: unknown }>;
  };
  strict.properties.name!.type = "string";
  const fx = fixtures.find((f) => f.file === "validate_vat.de-undisclosed.json")!;
  const result = new AjvJsonSchemaValidator().getValidator(strict)(fx.response);
  assert.equal(result.valid, false);
});

/**
 * Structural invariant: upstream registries can return null for any field,
 * and we only learn which ones in production. Every declared property must
 * therefore accept null, nothing may be required, and unknown fields must be
 * allowed.
 */
test("every declared outputSchema property accepts null; nothing is required", () => {
  function walk(schema: Record<string, unknown>, path: string): void {
    assert.equal(schema.required, undefined, `${path} declares required`);
    assert.notEqual(schema.additionalProperties, false, `${path} forbids additional properties`);
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const [key, prop] of Object.entries(props)) {
      const types = Array.isArray(prop.type) ? prop.type : [prop.type];
      assert.ok(types.includes("null"), `${path}.${key} must allow null (type: ${JSON.stringify(prop.type)})`);
      walk(prop, `${path}.${key}`);
    }
    if (schema.items && typeof schema.items === "object") {
      walk(schema.items as Record<string, unknown>, `${path}[]`);
    }
  }
  for (const t of tools.filter((t) => t.outputSchema)) {
    walk(t.outputSchema!, t.name);
  }
});
