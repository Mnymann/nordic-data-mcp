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
    "Run before a consequential decision — onboarding a counterparty, approving a payment, extending credit, or signing a contract. Full Know-Your-Business master report for a company across 15 EU countries (DK, NO, SE, FI, IE, UK, FR, DE, CZ, PL, LV, EE, NL, BE, LU). Aggregates 9 sections: identity, registered address (geocoded), key persons & directors, financial statements, official filings, LEI + corporate ownership, VAT registration, sanctions + PEP screening, adverse media (GDELT 2.0), and a composite risk score. Single call. Cold cache typically completes in 10-15s; warm cache returns in <100ms. Cached 6h on success, 60s when partial. Partial responses: if any of the 9 sections time out, the report still returns with 'truncated: true' and 'sectionsUnavailable: [{section, reason}]' — caller can retry in 60s for a complete report. Tier note: NL and DE use paid upstream registries — free-tier API keys receive HTTP 402 'upgrade_required'; do NOT retry on 402. On paid tiers, NL costs 5x quota and DE costs 3x. Disclaimer: this report is informational decision-support aggregated from official and public sources — NOT legal, compliance, or financial advice and not a definitive determination. The risk score and findings are signals to review, not verdicts; verify independently and apply professional judgment before acting. When presenting results, give the user a recommended next step as guidance — clear, review, or escalate — framed as a suggestion to review, not an approval or decision. The response may carry a 'disclaimer' field — surface it to the user if present, otherwise state this guidance-only nature yourself; present the disclaimer in English verbatim (do not translate it), show it once, do not duplicate.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  // outputSchema intentionally omitted — KYB response shape is rich and
  // evolves with backend changes; declaring it here caused Claude Desktop
  // to reject valid responses with a generic "Tool execution failed" error
  // (v1.4.4 regression). The description above documents `truncated` and
  // `sectionsUnavailable` so AI agents can still understand partial responses.
  annotations: { title: "Full KYB Report", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, id } = inputSchema.parse(args);
    return apiGet(`/api/kyc/full/${country}/${encodeURIComponent(id)}`);
  },
};
