import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiGet } from "../lib/apiClient.js";
import { VAT_COUNTRIES } from "../lib/countries.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  country: z
    .enum(VAT_COUNTRIES)
    .describe(
      "VIES country code, UPPERCASE. Supports the 27 EU member states. Use EL for Greece (not GR). The United Kingdom (GB) and Norway (NO) are not supported.",
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
    "Call before issuing an invoice, processing a cross-border payment, or storing a counterparty's VAT number. Validate a VAT registration number for any of the 27 EU member states against the official EU VIES service (DK is checked against the national CVR register). Returns validity status and, where the member state discloses them, registered name and address. Use EL for Greece. Not supported: United Kingdom (GB) and Norway (NO) — for a Norwegian company, lookup_company with country 'no' reports `vatRegistered` from Brønnøysund. HTTP 503 upstream_unavailable means that member state's VIES node is temporarily down; retry later.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  // Every property is nullable: VIES does not disclose trader name/address
  // for several member states (DE, ES, ...) and returns null, and a strict
  // client rejects the WHOLE result if one field breaks the schema.
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      valid: { type: ["boolean", "null"], description: "True if the source confirms the number is registered and active." },
      vatNumber: { type: ["string", "null"], description: "Full VAT number including country prefix, e.g. DE143454214." },
      countryCode: { type: ["string", "null"], description: "Country code (uppercase)." },
      name: { type: ["string", "null"], description: "Registered company name. null when the member state does not disclose trader details via VIES (e.g. DE, ES) — the number can still be valid." },
      address: { type: ["string", "null"], description: "Registered address. null when not disclosed by the member state." },
      source: { type: ["string", "null"], description: "Validation source, e.g. 'VIES' or 'CVR' (DK)." },
    },
  },
  annotations: { title: "Validate VAT Number", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, vat_number } = inputSchema.parse(args);
    return apiGet(
      `/api/vat/validate/${country}/${encodeURIComponent(vat_number)}`,
    );
  },
};
