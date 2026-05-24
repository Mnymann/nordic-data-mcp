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
    "Full Know-Your-Business master report for a company across 15 EU countries (DK, NO, SE, FI, IE, UK, FR, DE, CZ, PL, LV, EE, NL, BE, LU). Aggregates 9 sections: identity, registered address (geocoded), key persons & directors, financial statements, official filings, LEI + corporate ownership, VAT registration, sanctions + PEP screening, adverse media (GDELT 2.0), and a composite risk score. Single call. Cold cache typically completes in 10-15s; warm cache returns in <100ms. Cached 6h on success, 60s when partial. Partial responses: if any of the 9 sections time out, the report still returns with 'truncated: true' and 'sectionsUnavailable: [{section, reason}]' — caller can retry in 60s for a complete report. Tier note: NL and DE use paid upstream registries — free-tier API keys receive HTTP 402 'upgrade_required'; do NOT retry on 402. On paid tiers, NL costs 5x quota and DE costs 3x.",
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
      truncated: {
        type: "boolean",
        description: "True if one or more sections hit the internal 14s race-cap and were skipped. When true, the report is cached for only 60s (not 6h) and risk.level is forced to 'unknown'. Retry in 60s for a complete report.",
      },
      sectionsUnavailable: {
        type: "array",
        description: "Sections that could not be fetched in time or returned an upstream error. Empty array (or omitted) when all 9 sections succeeded. The report is still usable — these sections are simply missing, not failed.",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            section: {
              type: "string",
              description: "Section name. One of: identity, persons, financials, filings, address, vat, lei, sanctions, adverseMedia.",
            },
            reason: {
              type: "string",
              description: "Why this section is missing. One of: upstream_timeout, upstream_error, deadline_exceeded, not_applicable.",
            },
          },
        },
      },
    },
  },
  annotations: { title: "Full KYB Report", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, id } = inputSchema.parse(args);
    return apiGet(`/api/kyc/full/${country}/${encodeURIComponent(id)}`);
  },
};
