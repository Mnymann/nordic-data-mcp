/**
 * Country-coverage guard: an agent must never be offered a country that
 * errors. A live audit on 2026-09-15 found three tools advertising countries
 * the API rejects:
 *   - company_enriched: HTTP 400 invalid_country outside dk/no/se/fi
 *   - autocomplete_address: 404 outside dk/no/se/fi/fr
 *   - validate_vat: 400 for GB and NO, and for GR (VIES uses EL for Greece)
 *
 * These tests pin each tool's advertised `country` enum to the verified set
 * and check the description names the same countries. Widening a set requires
 * re-verifying it against the live API first.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NORDIC_API_KEY ??= "test-key";
const { tools } = await import("../src/tools/index.js");
const { dispatchToolCall } = await import("../src/lib/dispatcher.js");
const { runWithRequestOptions } = await import("../src/lib/requestContext.js");

function countryEnum(toolName: string): string[] {
  const tool = tools.find((t) => t.name === toolName)!;
  const props = tool.jsonSchema.properties as Record<string, { enum?: string[] }>;
  return [...props.country!.enum!].sort();
}

test("company_enriched offers only dk, no, se, fi", () => {
  assert.deepEqual(countryEnum("company_enriched"), ["dk", "fi", "no", "se"]);
  const d = tools.find((t) => t.name === "company_enriched")!.description;
  assert.match(d, /DK, NO, SE, FI/);
  assert.doesNotMatch(d, /Wikidata|15 countries/);
});

test("autocomplete_address offers only dk, no, se, fi, fr", () => {
  assert.deepEqual(countryEnum("autocomplete_address"), ["dk", "fi", "fr", "no", "se"]);
  const d = tools.find((t) => t.name === "autocomplete_address")!.description;
  assert.match(d, /DK, NO, SE, FI, FR/);
  assert.doesNotMatch(d, /15 countries/);
});

test("validate_vat offers the 27 EU VIES codes — EL, not GR; no GB or NO", () => {
  const codes = countryEnum("validate_vat");
  assert.equal(codes.length, 27);
  assert.ok(codes.includes("EL"));
  for (const bad of ["GR", "GB", "UK", "NO", "XI"]) {
    assert.ok(!codes.includes(bad), `validate_vat must not offer ${bad}`);
  }
  assert.doesNotMatch(tools.find((t) => t.name === "validate_vat")!.description, /HMRC/);
});

test("defaultCountry is not injected into a tool that does not cover it", async () => {
  // uk is valid for lookup_company but not for autocomplete_address: the
  // agent should get a missing-country validation error, not an upstream 404.
  const realFetch = globalThis.fetch;
  const fetched: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    fetched.push(String(url));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const result = await runWithRequestOptions({ defaultCountry: "uk" }, () =>
      dispatchToolCall("autocomplete_address", { query: "Baker Street" }),
    );
    assert.equal(result.isError, true);
    assert.match((result.content[0] as { text: string }).text, /country/i);
    assert.deepEqual(fetched, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});
