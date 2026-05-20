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
    .describe(
      "National company identifier — same format as lookup_company (e.g. DK CVR 8 digits, NO orgnr 9 digits).",
    ),
});

export const kybFull: McpTool = {
  name: "kyb_full",
  description:
    "Full Know-Your-Business master report for a company across 12 EU countries. Aggregates: identity, registered address (geocoded), key persons & directors, financial statements, official filings, LEI + corporate ownership, VAT registration, sanctions + PEP screening, adverse media (GDELT 2.0), and a composite risk score. Single call. Cached 6h; may take 5-15s on cold cache.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const { country, id } = inputSchema.parse(args);
    return apiGet(`/api/kyc/full/${country}/${encodeURIComponent(id)}`);
  },
};
