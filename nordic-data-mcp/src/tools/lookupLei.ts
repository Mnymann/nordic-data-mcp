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
    "Look up a Legal Entity Identifier (LEI) via GLEIF — the global standard for entity identification. Returns legal name, registered address, status, parent + ultimate parent relationships, and child entities (subsidiaries). Also supports reverse lookup from a national company number to LEI across 15 countries (DK, NO, SE, FI, IE, UK, FR, DE, CZ, PL, LV, EE, NL, BE, LU). Tier note (reverse mode only): NL and DE use paid upstream registries — free-tier API keys receive HTTP 402 'upgrade_required'; do NOT retry on 402.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  // Matches the live response shapes (verified 2026-09-15). mode='lei' returns
  // a single record; mode='reverse' returns {found, count, records}. Every
  // property is nullable: a strict client rejects the whole result if one
  // field breaks the schema.
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      lei: { type: ["string", "null"], description: "20-character ISO 17442 identifier (mode='lei')." },
      legalName: { type: ["string", "null"], description: "Registered legal name (mode='lei')." },
      status: { type: ["string", "null"], description: "Entity status, e.g. ACTIVE / INACTIVE." },
      jurisdiction: { type: ["string", "null"] },
      registeredAs: { type: ["string", "null"], description: "National registry identifier." },
      legalForm: { type: ["string", "null"], description: "ISO 20275 entity legal form code." },
      legalAddress: { type: ["object", "null"], additionalProperties: true },
      registration: {
        type: ["object", "null"],
        additionalProperties: true,
        description: "GLEIF registration metadata (initial, lastUpdate, status ISSUED/LAPSED/..., nextRenewal).",
      },
      found: { type: ["boolean", "null"], description: "mode='reverse': whether any LEI exists for the national ID." },
      count: { type: ["integer", "null"], description: "mode='reverse': number of LEI records found." },
      records: {
        type: ["array", "null"],
        items: { type: "object", additionalProperties: true },
        description: "mode='reverse': matching LEI records (same shape as a mode='lei' result).",
      },
      relationships: {
        type: ["object", "null"],
        additionalProperties: true,
        description: "Only present when include_relationships=true.",
        properties: {
          parent: {
            type: ["object", "null"],
            additionalProperties: true,
            description: "{directParent, ultimateParent, isUltimate}; directParent/ultimateParent are null for a top-level entity.",
          },
          children: {
            type: ["object", "null"],
            additionalProperties: true,
            description: "Paginated subsidiaries: {total, page, totalPages, children: [LEI records]}.",
          },
        },
      },
      source: { type: ["string", "null"] },
      fetchedAt: { type: ["string", "null"] },
    },
  },
  annotations: { title: "Look Up LEI", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
