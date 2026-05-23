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
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      identity: {
        type: "object",
        additionalProperties: true,
        description: "Core registry data (name, number, status, address, founded, industry).",
      },
      persons: {
        type: "array",
        items: { type: "object", additionalProperties: true },
        description: "Directors, beneficial owners and other key persons.",
      },
      financials: {
        type: "object",
        additionalProperties: true,
        description: "Latest filed financial statements / key figures.",
      },
      lei: {
        type: "object",
        additionalProperties: true,
        description: "GLEIF LEI record + parent / ultimate parent if any.",
      },
      vat: {
        type: "object",
        additionalProperties: true,
        description: "VAT registration status (VIES / HMRC).",
      },
      sanctions: {
        type: "object",
        additionalProperties: true,
        description: "Sanctions + PEP screening results for the company and key persons.",
      },
      adverse_media: {
        type: "object",
        additionalProperties: true,
        description: "GDELT 2.0 adverse-media signal summary.",
      },
      risk_score: {
        type: "object",
        additionalProperties: true,
        properties: {
          score: { type: "number", description: "Composite risk score 0-100." },
          tier: { type: "string", description: "Risk tier label (low / medium / high)." },
          reasons: {
            type: "array",
            items: { type: "string" },
            description: "Human-readable contributors to the score.",
          },
        },
      },
      generated_at: { type: "string", description: "ISO-8601 timestamp the report was assembled." },
      cached: { type: "boolean", description: "True if served from the 6h cache." },
    },
  },
  annotations: { title: "Full KYB Report", readOnlyHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, id } = inputSchema.parse(args);
    return apiGet(`/api/kyc/full/${country}/${encodeURIComponent(id)}`);
  },
};
