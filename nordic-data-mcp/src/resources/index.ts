import { tools } from "../tools/index.js";
import {
  ADDRESS_COUNTRIES,
  ENRICHED_COUNTRIES,
  SUPPORTED_COUNTRIES,
  VAT_COUNTRIES,
} from "../lib/countries.js";

/**
 * Static documentation resources exposed over MCP `resources/list` and
 * `resources/read`. They contain no per-user data and make no upstream API
 * calls, so they are safe to serve without an API key (discovery clients can
 * read them to understand the server before a key is configured).
 */
interface ResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  build: () => string;
}

const COUNTRY_NAMES: Record<string, string> = {
  dk: "Denmark",
  no: "Norway",
  se: "Sweden",
  fi: "Finland",
  ie: "Ireland",
  uk: "United Kingdom",
  fr: "France",
  de: "Germany",
  cz: "Czechia",
  pl: "Poland",
  lv: "Latvia",
  ee: "Estonia",
  nl: "Netherlands",
  be: "Belgium",
  lu: "Luxembourg",
};

const COUNTRY_NOTES: Record<string, string> = {
  nl: "Paid plan required (free tier → HTTP 402); 5x quota cost",
  de: "Paid plan required (free tier → HTTP 402); 3x quota cost",
};

function countriesDoc(): string {
  const rows = SUPPORTED_COUNTRIES.map((c) => {
    const name = COUNTRY_NAMES[c] ?? c.toUpperCase();
    const note = COUNTRY_NOTES[c] ?? "1x quota";
    const enriched = (ENRICHED_COUNTRIES as readonly string[]).includes(c) ? "yes" : "—";
    const address = (ADDRESS_COUNTRIES as readonly string[]).includes(c) ? "yes" : "—";
    return `| \`${c}\` | ${name} | ${enriched} | ${address} | ${note} |`;
  }).join("\n");

  return `# Supported countries

## Company-data tools (use lowercase ISO 3166-1 alpha-2 codes)

\`lookup_company\`, \`kyb_full\` and \`lookup_lei\` (reverse mode) cover all 15 countries below. \`company_enriched\` and \`autocomplete_address\` cover only the countries marked "yes".

| Code | Country | \`company_enriched\` | \`autocomplete_address\` | Notes |
|------|---------|------|------|-------|
${rows}

NL and DE are tier-gated by the backend: free-tier keys receive HTTP 402 \`upgrade_required\`. All countries except NL (5x) and DE (3x) cost 1x quota.

## VAT validation (\`validate_vat\`) — 27 EU member states, use UPPERCASE VIES codes

Use **EL**, not GR, for Greece. The United Kingdom (GB) and Norway (NO) are not supported.

${VAT_COUNTRIES.join(", ")}
`;
}

function toolsDoc(): string {
  const lines = tools.map((t) => `- **\`${t.name}\`** — ${t.description}`).join("\n");
  return `# Tool catalog

This server exposes ${tools.length} tools: 8 curated high-level tools plus 3 discovery meta-tools that reach the full API at runtime.

${lines}

## When to use the discovery tools

If none of the 8 curated tools fit, call \`list_endpoints\` to find a relevant endpoint, \`get_endpoint_schema\` to learn its parameters, then \`call_endpoint\` to execute it. Together they cover ~233 data endpoints.
`;
}

function gettingStartedDoc(): string {
  return `# Getting started

1. Get an API key at https://addonnordic.com — the free tier allows 100 lookups/day. Keys start with \`ndk_\`.
2. Provide the key as your personal credential; usage is billed to your account.
3. Country codes:
   - Company tools use lowercase ISO codes (e.g. \`dk\`, \`se\`, \`fr\`).
   - \`validate_vat\` uses UPPERCASE VIES codes for the 27 EU member states (\`EL\` for Greece); the United Kingdom and Norway are not supported.
   - \`company_enriched\` covers DK, NO, SE, FI; \`autocomplete_address\` covers DK, NO, SE, FI, FR.
4. NL and DE require a paid plan (free-tier keys get HTTP 402). NL costs 5x quota, DE 3x, all others 1x.

See the \`nordic://countries\` and \`nordic://tools\` resources for the full country list and tool catalog.

## Disclaimer

Nordic Data returns informational decision-support aggregated from official and public sources. It is **not** legal, compliance, financial, or professional advice, and not a definitive determination. Sanctions/PEP matches, KYB reports, and risk scores are signals to review, not verdicts — verify independently and apply your own professional judgment before acting.
`;
}

export const resources: ResourceDef[] = [
  {
    uri: "nordic://countries",
    name: "Supported countries",
    description:
      "Per-tool country coverage for company tools (lowercase) and VAT validation (uppercase VIES codes), including tier-gating and quota cost.",
    mimeType: "text/markdown",
    build: countriesDoc,
  },
  {
    uri: "nordic://tools",
    name: "Tool catalog",
    description:
      "List of all available tools with one-line descriptions and guidance on the curated vs discovery tools.",
    mimeType: "text/markdown",
    build: toolsDoc,
  },
  {
    uri: "nordic://getting-started",
    name: "Getting started",
    description: "How to obtain an API key, country-code rules, and tier-gating notes.",
    mimeType: "text/markdown",
    build: gettingStartedDoc,
  },
];

export function listResources() {
  return resources.map(({ uri, name, description, mimeType }) => ({
    uri,
    name,
    description,
    mimeType,
  }));
}

export function readResource(uri: string) {
  const r = resources.find((x) => x.uri === uri);
  if (!r) return null;
  return { uri: r.uri, mimeType: r.mimeType, text: r.build() };
}
