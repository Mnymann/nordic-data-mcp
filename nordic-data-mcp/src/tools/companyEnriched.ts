import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiGet } from "../lib/apiClient.js";
import { SUPPORTED_COUNTRIES } from "../lib/countries.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  country: z
    .enum(SUPPORTED_COUNTRIES)
    .describe("ISO 3166-1 alpha-2 country code, lowercase."),
  id: z
    .string()
    .min(1)
    .describe("National company identifier — same format as lookup_company."),
});

export const companyEnriched: McpTool = {
  name: "company_enriched",
  description:
    "Enriched company data: basic registry data + DAWA-validated address with lat/lng + industry statistics (DST for DK, SSB for NO, etc.) + Wikidata enrichment (website, employees, CEO, ticker, logo, Wikipedia URL). One call, multiple sources.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  annotations: { title: "Enriched Company Profile", readOnlyHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, id } = inputSchema.parse(args);
    return apiGet(
      `/api/company/${country}/${encodeURIComponent(id)}/enriched`,
    );
  },
};
