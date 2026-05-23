import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiGet } from "../lib/apiClient.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  siren: z
    .string()
    .regex(/^\d{9}$/, "SIREN must be exactly 9 digits")
    .describe(
      "9-digit French SIREN number. Examples: 652014051 (Carrefour), 775670417 (LVMH). No spaces or punctuation.",
    ),
});

export const frHistory: McpTool = {
  name: "fr_history",
  description:
    "French company history timeline. Returns one event per change to the company's name, activity (NAF code), status (active/closed), legal form, or social-economy flag, derived from INSEE Sirene 3.11's bitemporal periodesUniteLegale array. Includes 'initial:<field>' events that show the state at company creation (date, name, NAF code, etc.). Input: 9-digit SIREN number. Cost: 1 quota unit; free tier supported (France is not tier-gated, unlike NL and DE). Cache: 24h server-side. Errors: 400 invalid_id_format (not 9 digits), 403 non_diffusible (SIREN exists but is privacy-protected under art. R123-232-1), 404 not_found, 503 upstream_unavailable.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      siren: { type: "string", description: "9-digit SIREN echoed back." },
      dateCreation: {
        type: "string",
        description: "ISO-8601 date the legal entity was created.",
      },
      categorieEntreprise: {
        type: "string",
        description: "INSEE company size category: PME, ETI, GE.",
      },
      sigle: {
        type: ["string", "null"],
        description: "Acronym / short name, if any.",
      },
      periodCount: {
        type: "integer",
        description: "Number of bitemporal periods returned by INSEE.",
      },
      count: {
        type: "integer",
        description: "Number of history events derived.",
      },
      events: {
        type: "array",
        description:
          "Chronologically ordered events. Each event has 'initial:<field>' type for the baseline period or a plain field name for subsequent changes.",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            date: {
              type: "string",
              description: "ISO-8601 start date of the period.",
            },
            endDate: {
              type: ["string", "null"],
              description:
                "ISO-8601 end date of the period; null for the currently-active period.",
            },
            type: {
              type: "string",
              description:
                "Event type. One of: initial:name, initial:usage_name, initial:activity, initial:status, initial:legal_form, initial:employer_flag, initial:ess_flag, name, usage_name, activity, status, legal_form, employer_flag, ess_flag.",
            },
            from: {
              type: ["string", "null"],
              description:
                "Previous value of the field. Null for initial: events.",
            },
            to: {
              type: ["string", "null"],
              description:
                "New value of the field after the change.",
            },
          },
        },
      },
      source: {
        type: "string",
        description: "Upstream data source — 'api.insee.fr'.",
      },
      sourceNote: {
        type: "string",
        description:
          "Provenance note describing the upstream API and field set used.",
      },
      fetchedAt: {
        type: "string",
        description: "ISO-8601 timestamp when the data was fetched upstream.",
      },
    },
  },
  annotations: {
    title: "French Company History",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (args) => {
    const { siren } = inputSchema.parse(args);
    return apiGet(`/api/company/fr/${siren}/history`);
  },
};
