import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiGet } from "../lib/apiClient.js";
import { ENRICHED_COUNTRIES } from "../lib/countries.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  country: z
    .enum(ENRICHED_COUNTRIES)
    .describe("ISO 3166-1 alpha-2 country code, lowercase. Only dk, no, se and fi are supported."),
  id: z
    .string()
    .min(1)
    .describe("National company identifier — same format as lookup_company."),
});

export const companyEnriched: McpTool = {
  name: "company_enriched",
  description:
    "Company registry data plus national industry statistics in one call. Returns `company` (same shape as lookup_company) and `industryStats` — a time series from the national statistics office for the company's industry code (currently Danmarks Statistik for DK); `industryStats.available` is false when no statistics exist. Supports 4 countries: DK, NO, SE, FI. For other countries use lookup_company (basic registry data) or kyb_full (full due-diligence report).",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  // Matches the live response shape (verified 2026-09-15). Every property is
  // nullable: a strict client rejects the whole result if one field breaks
  // the schema.
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      company: {
        type: ["object", "null"],
        additionalProperties: true,
        description: "Registry data — same shape as lookup_company output.",
      },
      industryStats: {
        type: ["object", "null"],
        additionalProperties: true,
        description: "National industry statistics (DST for DK, SSB for NO, etc.).",
        properties: {
          available: { type: ["boolean", "null"], description: "False when no statistics exist for the company's industry code." },
          data: {
            type: ["array", "null"],
            items: { type: "object", additionalProperties: true },
            description: "Time series of {year, value, unit} rows.",
          },
          source: { type: ["string", "null"] },
        },
      },
    },
  },
  annotations: { title: "Enriched Company Profile", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, id } = inputSchema.parse(args);
    return apiGet(
      `/api/company/${country}/${encodeURIComponent(id)}/enriched`,
    );
  },
};
