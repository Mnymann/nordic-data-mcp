import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiGet } from "../lib/apiClient.js";
import { SUPPORTED_COUNTRIES } from "../lib/countries.js";
import type { McpTool } from "../types.js";

const inputSchema = z
  .object({
    mode: z
      .enum(["lei", "reverse"])
      .describe(
        "'lei' = look up by LEI directly. 'reverse' = look up LEI from national company number.",
      ),
    lei: z
      .string()
      .length(20)
      .optional()
      .describe(
        "20-character ISO 17442 Legal Entity Identifier. Required when mode='lei'.",
      ),
    country: z
      .enum(SUPPORTED_COUNTRIES)
      .optional()
      .describe(
        "ISO 3166-1 alpha-2 country code, lowercase. Required when mode='reverse'.",
      ),
    id: z
      .string()
      .min(1)
      .optional()
      .describe("National company ID. Required when mode='reverse'."),
    include_relationships: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        "If true, also fetch parent and child entities. Only applies when mode='lei'.",
      ),
  })
  .refine(
    (v) =>
      (v.mode === "lei" && !!v.lei) ||
      (v.mode === "reverse" && !!v.country && !!v.id),
    {
      message:
        "Provide 'lei' when mode='lei', or both 'country' and 'id' when mode='reverse'.",
    },
  );

export const lookupLei: McpTool = {
  name: "lookup_lei",
  description:
    "Look up a Legal Entity Identifier (LEI) via GLEIF — the global standard for entity identification. Returns legal name, registered address, status, parent + ultimate parent relationships, and child entities (subsidiaries). Also supports reverse lookup from a national company number to LEI.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      lei: { type: "string", description: "20-character ISO 17442 identifier." },
      legal_name: { type: "string" },
      status: { type: "string", description: "ISSUED / LAPSED / RETIRED / etc." },
      registration: {
        type: "object",
        additionalProperties: true,
        description: "GLEIF registration metadata (initial date, last update, status).",
      },
      legal_address: { type: "object", additionalProperties: true },
      headquarters_address: { type: "object", additionalProperties: true },
      relationships: {
        type: "object",
        additionalProperties: true,
        description: "Only present when include_relationships=true.",
        properties: {
          parent: { type: "object", additionalProperties: true, description: "Direct parent LEI record or null." },
          children: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            description: "Known subsidiary LEI records.",
          },
        },
      },
    },
  },
  annotations: { title: "Look Up LEI", readOnlyHint: true, openWorldHint: true },
  handler: async (args) => {
    const parsed = inputSchema.parse(args);
    if (parsed.mode === "reverse") {
      return apiGet(
        `/api/lei/lookup/${parsed.country}/${encodeURIComponent(parsed.id!)}`,
      );
    }
    const lei = encodeURIComponent(parsed.lei!);
    const primary = await apiGet<Record<string, unknown>>(`/api/lei/${lei}`);
    if (!parsed.include_relationships) return primary;

    const [parent, children] = await Promise.all([
      apiGet(`/api/lei/${lei}/parent`).catch((err) => ({
        error: true,
        message: err?.message ?? String(err),
      })),
      apiGet(`/api/lei/${lei}/children`).catch((err) => ({
        error: true,
        message: err?.message ?? String(err),
      })),
    ]);
    return { ...primary, relationships: { parent, children } };
  },
};
