import type { z } from "zod";

export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  title?: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  /**
   * JSON Schema describing the structured object returned by the tool.
   * Surfaced to MCP clients via `tools/list` so agents and registries
   * (Smithery quality score, MCP Inspector) understand the response
   * shape. The schemas use `additionalProperties: true` because the
   * upstream Nordic Data API may add fields without notice.
   */
  outputSchema?: Record<string, unknown>;
  annotations?: McpToolAnnotations;
  handler: (args: unknown) => Promise<unknown>;
}
