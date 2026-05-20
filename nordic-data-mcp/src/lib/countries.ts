/**
 * Supported countries across Nordic Data API tools.
 *
 * Company-data tools use the lowercase set (12 countries with native business registries).
 * NL and BE are intentionally excluded — they belong to a separate Benelux package.
 * VAT validation uses the uppercase set (broader EU coverage via VIES + HMRC for GB)
 * and still includes NL/BE because VIES is free upstream.
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
