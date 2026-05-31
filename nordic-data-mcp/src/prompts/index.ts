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
      "Run a full company due-diligence workflow: registry data, KYB report, and sanctions screening, then summarize the risk.",
    arguments: [
      { name: "company", description: "Company name or registration number", required: true },
      { name: "country", description: "Lowercase ISO country code, e.g. dk", required: true },
    ],
    build: (a) =>
      `Perform due diligence on "${a.company}" in country "${a.country}". Steps:\n` +
      `1. Use lookup_company to get the basic registry record and confirm the legal entity.\n` +
      `2. Use kyb_full for the complete KYB report (identity, persons, financials, LEI, VAT, sanctions, adverse media, risk score).\n` +
      `3. Use screen_sanctions on the company and its key persons against UN/EU/OFAC/PEP lists.\n` +
      `4. Summarize: legal identity, ownership/control, financial health, any sanctions or PEP hits, and an overall risk assessment with reasoning.`,
  },
  {
    name: "vat_check",
    description: "Validate a VAT number and report the registered business behind it.",
    arguments: [
      { name: "vat_number", description: "VAT number to validate", required: true },
      {
        name: "country",
        description: "UPPERCASE country code; use GB (not UK) for the United Kingdom",
        required: true,
      },
    ],
    build: (a) =>
      `Validate VAT number "${a.vat_number}" for country "${a.country}" using validate_vat ` +
      `(remember: use GB, not UK, for the United Kingdom). Report whether it is valid, and the ` +
      `registered company name and address if available.`,
  },
  {
    name: "sanctions_screening",
    description:
      "Screen one or more names against UN/EU/OFAC/PEP lists and interpret the matches.",
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
      `a confidence assessment, and a recommended next step (clear, review, or escalate).`,
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
