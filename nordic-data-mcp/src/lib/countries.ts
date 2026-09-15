/**
 * Supported countries across Nordic Data API tools.
 *
 * Each tool's `country` enum must list ONLY codes the live backend actually
 * serves — an agent must never be offered a country that errors. The sets
 * below were verified against https://api.addonnordic.dk on 2026-09-15;
 * re-verify before widening any of them.
 *
 * Company-data tools (lookup_company, kyb_full, lookup_lei reverse) use the
 * lowercase 15-country set. Backend enforces tier-gating: NL and DE require a
 * Starter+ subscription (free-tier keys receive HTTP 402 upgrade_required).
 * On paid tiers, NL calls cost 5x quota units and DE calls cost 3x — all
 * others 1x.
 */

export const SUPPORTED_COUNTRIES = [
  "dk",
  "no",
  "se",
  "fi",
  "ie",
  "uk",
  "fr",
  "de",
  "cz",
  "pl",
  "lv",
  "ee",
  "nl",
  "be",
  "lu",
] as const;

export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

/**
 * company_enriched: `/api/company/{country}/{id}/enriched` returns HTTP 400
 * `invalid_country` for every country outside this set.
 */
export const ENRICHED_COUNTRIES = ["dk", "no", "se", "fi"] as const;

/**
 * autocomplete_address: `/api/address/{country}/autocomplete` exists only for
 * these countries (404 for the rest).
 */
export const ADDRESS_COUNTRIES = ["dk", "no", "se", "fi", "fr"] as const;

/**
 * validate_vat: the 27 EU member states via VIES, using VIES country codes —
 * Greece is EL (GR is rejected). GB and NO are NOT supported by
 * `/api/vat/validate` (HTTP 400 invalid_country_code).
 */
export const VAT_COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "EL",
  "ES",
  "FI",
  "FR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
] as const;

export type VatCountry = (typeof VAT_COUNTRIES)[number];
