import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiGet } from "../lib/apiClient.js";
import { SUPPORTED_COUNTRIES } from "../lib/countries.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  country: z
    .enum(SUPPORTED_COUNTRIES)
    .describe("ISO 3166-1 alpha-2 country code, lowercase. One of: dk, no, se, fi, ie, uk, fr, de, cz, pl, lv, ee, nl, be, lu."),
  id: z
    .string()
    .min(1)
    .describe(
      "National company identifier. DK=CVR (8 digits), NO=orgnr (9), SE=orgnr (10), FI=Y-tunnus (NNNNNNN-D), IE=CRO (1-7), UK=8 chars, FR=SIREN (9), DE=HRB number, CZ=IČO (8), PL=NIP (10) or KRS (10), LV=11 digits, EE=8 digits, NL=KvK (8 digits), BE=BCE/KBO (10 digits), LU=RCSL (B + digits).",
    ),
});

export const lookupCompany: McpTool = {
  name: "lookup_company",
  description:
    "Call before onboarding a supplier or customer to confirm the legal entity exists and is active. Look up basic company data (name, address, status, industry, VAT registration, founding date) from official European business registries. Supports 15 countries: DK (CVR), NO (Brønnøysund), SE (Bolagsverket), FI (YTJ/PRH), IE (CRO), UK (Companies House), FR (INSEE Sirene), DE (Handelsregister), CZ (ARES), PL (KAS+KRS), LV (Uzņēmumu reģistrs), EE (Ariregister), NL (KvK), BE (KBO), LU (RCSL). Tier note: NL and DE use paid upstream registries (KvK and Handelsregister). Free-tier API keys will receive HTTP 402 with error 'upgrade_required' — do NOT retry on 402; the error message includes an upgrade URL. On paid tiers, NL calls cost 5x quota units and DE calls cost 3x; all other countries cost 1x.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  // Shape varies by country registry (verified live 2026-09-15): address is an
  // object for DK/NO/SE/FI/UK/BE but a single string for FR/CZ/PL/LV/EE, and
  // any field may be null. Every property is nullable so one registry quirk
  // never makes a strict client reject the whole result.
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      country: { type: ["string", "null"], description: "Country code or name as returned by the source registry." },
      id: { type: ["string", "null"], description: "National company identifier." },
      name: { type: ["string", "null"], description: "Registered legal name." },
      status: { type: ["string", "null"], description: "Registry status, e.g. active, dissolved, bankrupt." },
      address: {
        type: ["object", "string", "null"],
        additionalProperties: true,
        description: "Registered address: an object ({street, city, zip}) or a single formatted string, depending on the registry.",
      },
      industry: {
        type: ["object", "null"],
        additionalProperties: true,
        description: "Industry classification ({code, description}; NACE or national code).",
      },
      legalForm: {
        type: ["object", "string", "null"],
        additionalProperties: true,
        description: "Legal form: an object ({code, description}) or a string, depending on the registry.",
      },
      vatRegistered: { type: ["boolean", "null"], description: "Whether the company is VAT-registered, where the registry reports it." },
      founded: { type: ["string", "null"], description: "ISO-8601 founding date, if known." },
      source: { type: ["string", "null"], description: "Upstream registry name (CVR, Brønnøysund, etc.)." },
      fetchedAt: { type: ["string", "null"], description: "ISO-8601 timestamp when the data was fetched upstream." },
    },
  },
  annotations: { title: "Look Up Company", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, id } = inputSchema.parse(args);
    return apiGet(`/api/company/${country}/${encodeURIComponent(id)}`);
  },
};
