import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiGet } from "../lib/apiClient.js";
import { SUPPORTED_COUNTRIES } from "../lib/countries.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  country: z
    .enum(SUPPORTED_COUNTRIES)
    .describe("ISO 3166-1 alpha-2 country code, lowercase. One of: dk, no, se, fi, ie, uk, fr, de, cz, pl, lv, ee."),
  id: z
    .string()
    .min(1)
    .describe(
      "National company identifier. DK=CVR (8 digits), NO=orgnr (9), SE=orgnr (10), FI=Y-tunnus (NNNNNNN-D), IE=CRO (1-7), UK=8 chars, FR=SIREN (9), DE=LEI (20) or HRB number, CZ=IČO (8), PL=NIP (10) or KRS (10), LV=11 digits, EE=8 digits.",
    ),
});

export const lookupCompany: McpTool = {
  name: "lookup_company",
  description:
    "Look up basic company data (name, address, status, industry, VAT registration, founding date) from official European business registries. Supports 12 countries: DK (CVR), NO (Brønnøysund), SE (Bolagsverket), FI (YTJ/PRH), IE (CRO), UK (Companies House), FR (INSEE Sirene), DE (Handelsregister), CZ (ARES), PL (KAS+KRS), LV (Uzņēmumu reģistrs), EE (Ariregister). Note: Benelux (NL, BE, LU) is not covered — use benelux-data-mcp for those.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  annotations: { title: "Look Up Company", readOnlyHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, id } = inputSchema.parse(args);
    return apiGet(`/api/company/${country}/${encodeURIComponent(id)}`);
  },
};
