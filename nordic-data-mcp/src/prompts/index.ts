/**
 * Workflow prompts exposed over MCP `prompts/list` and `prompts/get`. Each
 * prompt expands to a ready-to-run instruction that chains the right tools.
 * Prompts contain no per-user data and make no upstream calls, so they are
 * safe to serve without an API key.
 */
interface PromptArg {
  name: string;
  description: string;
  required: boolean;
}

interface PromptDef {
  name: string;
  description: string;
  arguments: PromptArg[];
  build: (args: Record<string, string>) => string;
}

export const prompts: PromptDef[] = [
  {
    name: "due_diligence",
    description:
      "Run a full company due-diligence workflow: registry data, KYB report, and sanctions screening, then summarize the risk. Output is informational decision-support, not legal/compliance advice.",
    arguments: [
      { name: "company", description: "Company name or registration number", required: true },
      { name: "country", description: "Lowercase ISO country code, e.g. dk", required: true },
    ],
    build: (a) =>
      `Perform due diligence on "${a.company}" in country "${a.country}". Steps:\n` +
      `1. Use lookup_company to get the basic registry record and confirm the legal entity.\n` +
      `2. Use kyb_full for the complete KYB report (identity, persons, financials, LEI, VAT, sanctions, adverse media, risk score).\n` +
      `3. Use screen_sanctions on the company and its key persons against UN/EU/OFAC/PEP lists.\n` +
      `4. Summarize: legal identity, ownership/control, financial health, any sanctions or PEP hits, and an overall risk assessment with reasoning. Include a recommended next step as guidance — clear, review, or escalate — framed as a suggestion to review, not an approval or decision.\n` +
      `5. End the summary by surfacing the "disclaimer" field returned in the kyb_full response if present; otherwise add a brief note that this is decision-support/guidance, not legal/compliance/financial advice, to be independently verified. Keep the disclaimer in English, verbatim — do not translate it. Include it once, not twice.`,
  },
  {
    name: "vat_check",
    description: "Validate a VAT number and report the registered business behind it.",
    arguments: [
      { name: "vat_number", description: "VAT number to validate", required: true },
      {
        name: "country",
        description: "UPPERCASE EU member-state code (VIES); use EL for Greece. UK and Norway are not supported",
        required: true,
      },
    ],
    build: (a) =>
      `Validate VAT number "${a.vat_number}" for country "${a.country}" using validate_vat ` +
      `(EU member states only; use EL, not GR, for Greece). Report whether it is valid, and the ` +
      `registered company name and address if available.`,
  },
  {
    name: "sanctions_screening",
    description:
      "Screen one or more names against UN/EU/OFAC/PEP lists and interpret the matches. Matches are decision-support to review, not legal/compliance advice or a determination.",
    arguments: [
      {
        name: "names",
        description: "Comma-separated names of individuals or entities to screen",
        required: true,
      },
    ],
    build: (a) =>
      `Screen these names against UN/EU/OFAC/PEP lists using screen_sanctions: ${a.names}.\n` +
      `For each name report whether there is a likely match, the matched list(s) and entity, ` +
      `a confidence assessment, and a recommended next step as guidance — clear, review, or escalate — framed as a signal to review, not a verdict, approval, or decision.\n` +
      `Surface the "disclaimer" field returned in the screen_sanctions response if present; otherwise state that these matches are decision-support to review — not a determination or legal/compliance advice — and must be independently verified. Keep the disclaimer in English, verbatim — do not translate it. Include it once, not twice.`,
  },
];

export function listPrompts() {
  return prompts.map(({ name, description, arguments: args }) => ({
    name,
    description,
    arguments: args,
  }));
}

export function getPrompt(name: string, args: Record<string, string> = {}) {
  const p = prompts.find((x) => x.name === name);
  if (!p) return null;
  for (const arg of p.arguments) {
    if (arg.required && !args[arg.name]) {
      throw new Error(`Missing required argument: ${arg.name}`);
    }
  }
  return {
    description: p.description,
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text: p.build(args) },
      },
    ],
  };
}
