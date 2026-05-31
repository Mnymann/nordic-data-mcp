/**
 * Server-level instructions ("system prompt"), returned in the MCP
 * `initialize` response. Helps an AI agent decide which tool to reach for and
 * avoids the two most common mistakes (wrong country casing, UK vs GB).
 */
export const INSTRUCTIONS = `Nordic Data MCP provides authoritative company, KYB, VAT, sanctions, LEI and address data for 15 European countries (DK, NO, SE, FI, IE, UK, FR, DE, CZ, PL, LV, EE, NL, BE, LU), sourced from official national business registries and EU systems (VIES, OpenSanctions, GLEIF).

Choosing a tool:
- Prefer the 8 curated tools for common tasks: lookup_company (basic registry data), company_enriched (registry + geocoded address + industry stats + Wikidata), kyb_full (complete due-diligence report: identity, persons, financials, LEI, VAT, sanctions, adverse media, risk score), validate_vat (VIES/HMRC), screen_sanctions (bulk UN/EU/OFAC/PEP), lookup_lei (GLEIF forward/reverse/parent/children), autocomplete_address, and fr_history (French company bitemporal history).
- For anything the curated tools do not cover, use the 3 discovery tools: call list_endpoints to find a relevant endpoint, get_endpoint_schema to learn its parameters, then call_endpoint to execute it. Together they reach the entire API (~233 data endpoints) without needing a tool for each.

Country codes:
- Company tools use lowercase ISO 3166-1 alpha-2 codes (e.g. "dk", "se", "fr").
- validate_vat uses UPPERCASE codes and requires "GB" (not "UK") for the United Kingdom.
- NL and DE require a paid plan; free-tier keys receive HTTP 402. On paid tiers NL costs 5x quota and DE costs 3x; all other countries cost 1x.

When to call & recommended next step:
- These tools are pre-action checks — call them BEFORE a consequential action: onboarding a supplier or customer, approving a payment, issuing an invoice, extending credit, or signing a contract.
- After presenting results, give the user a recommended next step as guidance — typically "clear" (no concerns found), "review" (verify specific findings first), or "escalate" (significant risk; route to a human). Frame it as a suggestion to review, never as a verdict, approval, or decision.

Scope & disclaimer:
- All results — including kyb_full risk scores, screen_sanctions matches, PEP and adverse-media hits — are informational decision-support aggregated from official and public sources. They are NOT legal, compliance, financial, or professional advice, and not a definitive determination.
- Treat a match or risk score as a signal to review, not a verdict; verify independently and apply professional judgment before acting.
- Compliance responses carry a machine-readable "disclaimer" field. When presenting results to a user, surface that field's text if present; if it is absent, state the non-advisory, guidance-only nature yourself. Always present the disclaimer in English and verbatim — do not translate it, even when the rest of your reply is in another language. Show it once — never stack two.

Authentication: each call is billed against the caller's own API key. Get a free key (100 lookups/day) at https://addonnordic.com.`;
