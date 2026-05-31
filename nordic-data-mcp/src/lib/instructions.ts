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

Authentication: each call is billed against the caller's own API key. Get a free key (100 lookups/day) at https://addonnordic.com.`;
