import type { z } from "zod";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}
