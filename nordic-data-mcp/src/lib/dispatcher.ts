import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { tools } from "../tools/index.js";
import { formatError, NordicApiError } from "./errors.js";
import { getRequestOptions } from "./requestContext.js";
import { SUPPORTED_COUNTRIES } from "./countries.js";

/**
 * Tools whose `country` argument uses the 12-country lowercase set
 * (`SUPPORTED_COUNTRIES`). When a request scope sets `defaultCountry`
 * and the agent omits `country`, the dispatcher injects the default
 * into args BEFORE the tool's Zod schema validates them.
 *
 * `validate_vat` is intentionally NOT in this set — it uses a different
 * country list (VAT_COUNTRIES, uppercase, includes GB/EU-only entries),
 * and silently injecting a lowercase code there would create cryptic
 * validation failures.
 *
 * `screen_sanctions` takes no country argument at all.
 */
const LOWERCASE_COUNTRY_TOOLS = new Set<string>([
  "lookup_company",
  "kyb_full",
  "autocomplete_address",
  "company_enriched",
  "lookup_lei",
]);

type ToolContent = { type: "text"; text: string };

function maybeInjectCountry(
  toolName: string,
  args: unknown,
  defaultCountry: string | undefined,
): unknown {
  if (!defaultCountry) return args;
  if (!LOWERCASE_COUNTRY_TOOLS.has(toolName)) return args;
  if (!(SUPPORTED_COUNTRIES as readonly string[]).includes(defaultCountry)) {
    return args;
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  if ("country" in (args as Record<string, unknown>)) return args;
  return { ...(args as Record<string, unknown>), country: defaultCountry };
}

/**
 * Shared CallTool dispatcher used by both the HTTP (`/mcp`, `/mcp/auth`)
 * and stdio entrypoints. Honors per-request options for `defaultCountry`
 * injection and `verboseErrors` extra detail.
 */
export async function dispatchToolCall(
  name: string,
  rawArgs: unknown,
): Promise<CallToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Error: Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const { defaultCountry, verboseErrors } = getRequestOptions();
  const args = maybeInjectCountry(tool.name, rawArgs ?? {}, defaultCountry);

  try {
    const result = await tool.handler(args);
    const response: CallToolResult = {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
    // MCP spec: a tool that declares an outputSchema MUST return
    // structuredContent on success — strict clients reject the result
    // otherwise ("has an output schema but did not return structured
    // content"). structuredContent must be an object; the rare non-object
    // result is wrapped, which still validates (all our output schemas are
    // additionalProperties: true with no required fields).
    if (tool.outputSchema) {
      response.structuredContent =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : { result };
    }
    return response;
  } catch (err) {
    const content: ToolContent[] = [
      { type: "text", text: `Error: ${formatError(err)}` },
    ];
    if (verboseErrors && err instanceof NordicApiError) {
      content.push({
        type: "text",
        text: JSON.stringify(
          {
            verbose: true,
            status: err.status,
            code: err.code,
            source: err.source ?? null,
            details: err.details ?? null,
          },
          null,
          2,
        ),
      });
    }
    return { content, isError: true };
  }
}
