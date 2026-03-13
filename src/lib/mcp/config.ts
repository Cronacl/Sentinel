import { z } from "zod";

import type { MCPTransportId } from "@/server/db/enums";

export const mcpHeaderEntrySchema = z.object({
  key: z.string().trim().min(1, "Header name is required."),
  value: z.string().trim().min(1, "Header value is required."),
});

export const mcpEnvEntrySchema = z.object({
  key: z.string().trim().min(1, "Environment variable name is required."),
  value: z.string().trim().min(1, "Environment variable value is required."),
});

export const mcpHttpConfigSchema = z.object({
  bearerTokenEnvVar: z.string().trim().min(1).optional(),
  headers: z.array(mcpHeaderEntrySchema).default([]),
  headersFromEnv: z.array(mcpHeaderEntrySchema).default([]),
  url: z.string().trim().url("Enter a valid URL."),
});

export const mcpStdioConfigSchema = z.object({
  args: z
    .array(z.string().trim().min(1, "Argument cannot be empty."))
    .default([]),
  command: z.string().trim().min(1, "Command is required."),
  cwd: z.string().trim().min(1).optional(),
  envPassthrough: z
    .array(z.string().trim().min(1, "Environment variable name is required."))
    .default([]),
  envVars: z.array(mcpEnvEntrySchema).default([]),
});

export type McpHttpConfig = z.infer<typeof mcpHttpConfigSchema>;
export type McpStdioConfig = z.infer<typeof mcpStdioConfigSchema>;

export type McpServerConfigMap = {
  http: McpHttpConfig;
  stdio: McpStdioConfig;
};

export function validateMcpServerConfig<TTransport extends MCPTransportId>(
  transport: TTransport,
  config: unknown,
) {
  if (transport === "http") {
    return mcpHttpConfigSchema.parse(config) as McpServerConfigMap[TTransport];
  }

  return mcpStdioConfigSchema.parse(config) as McpServerConfigMap[TTransport];
}

export function createMcpServerDecryptionError(name: string): Error {
  return new Error(
    `MCP server "${name}" could not be decrypted. Re-save it in Settings > MCP Servers.`,
  );
}
