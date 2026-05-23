/**
 * Supported countries across Nordic Data API tools.
 *
 * Company-data tools use the lowercase set (15 countries with native business registries).
 * Backend enforces tier-gating: NL and DE require a Starter+ subscription
 * (free-tier keys receive HTTP 402 upgrade_required). On paid tiers, NL calls
 * cost 5x quota units and DE calls cost 3x — all others 1x.
 *
 * VAT validation uses the uppercase set (broader EU coverage via VIES + HMRC for GB).
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
 * VAT validation supports the broader EU + GB via VIES/HMRC.
 * Note: use GB (not UK) for the United Kingdom — HMRC requires GB.
 */
export const VAT_COUNTRIES = [
  "DK",
  "NO",
  "SE",
  "FI",
  "NL",
  "BE",
  "IE",
  "GB",
  "FR",
  "DE",
  "CZ",
  "PL",
  "LV",
  "EE",
  "AT",
  "BG",
  "CY",
  "HR",
  "ES",
  "IT",
  "LU",
  "MT",
  "PT",
  "RO",
  "SI",
  "SK",
  "HU",
  "GR",
  "LT",
] as const;

export type VatCountry = (typeof VAT_COUNTRIES)[number];
