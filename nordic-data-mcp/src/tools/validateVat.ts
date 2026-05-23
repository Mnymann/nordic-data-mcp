import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiGet } from "../lib/apiClient.js";
import { VAT_COUNTRIES } from "../lib/countries.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  country: z
    .enum(VAT_COUNTRIES)
    .describe(
      "ISO 3166-1 alpha-2 country code, UPPERCASE. Use GB for the United Kingdom (HMRC), not UK. Supports all EU member states plus GB and NO.",
    ),
  vat_number: z
    .string()
    .min(1)
    .describe(
      "VAT number WITHOUT country prefix — just the digits/characters. Example: for DK29403473, pass '29403473'.",
    ),
});

export const validateVat: McpTool = {
  name: "validate_vat",
  description:
    "Validate a VAT registration number against the official EU VIES service (or HMRC for GB). Returns validity status, registered name, and registered address.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      country: { type: "string", description: "Country code echoed back (uppercase)." },
      vat_number: { type: "string", description: "Submitted VAT number (without country prefix)." },
      valid: { type: "boolean", description: "True if VIES / HMRC confirms the number is registered and active." },
      name: { type: "string", description: "Registered company name, if disclosed by the source." },
      address: { type: "string", description: "Registered address, if disclosed." },
      checked_at: { type: "string", description: "ISO-8601 timestamp of the validation." },
      source: { type: "string", description: "Either 'VIES' or 'HMRC'." },
    },
  },
  annotations: { title: "Validate VAT Number", readOnlyHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, vat_number } = inputSchema.parse(args);
    return apiGet(
      `/api/vat/validate/${country}/${encodeURIComponent(vat_number)}`,
    );
  },
};
