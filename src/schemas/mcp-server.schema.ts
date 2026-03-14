import { z } from "zod";

import { getMcpCatalogEntry } from "@/lib/mcp/catalog";
import type { McpHttpConfig, McpStdioConfig } from "@/lib/mcp/config";
import {
  MCP_SERVER_CATALOG_IDS,
  MCP_TRANSPORTS,
  type McpServerCatalogId,
} from "@/server/db/enums";

const optionalText = z.string().optional().default("");
const optionalCatalogId = z.enum(MCP_SERVER_CATALOG_IDS).optional();
const keyValueRowSchema = z.object({
  key: optionalText,
  value: optionalText,
});
const valueRowSchema = z.object({
  value: optionalText,
});

function normalizeText(value?: string) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeKeyValueRows(rows: Array<{ key?: string; value?: string }>) {
  return rows
    .map((row) => ({
      key: row.key?.trim() ?? "",
      value: row.value?.trim() ?? "",
    }))
    .filter((row) => row.key.length > 0 || row.value.length > 0);
}

function normalizeValueRows(rows: Array<{ value?: string }>) {
  return rows
    .map((row) => row.value?.trim() ?? "")
    .filter((value) => value.length > 0);
}

export const mcpTransportSchema = z.enum(MCP_TRANSPORTS);

const mcpHttpUpsertSchema = z.object({
  config: z.object({
    bearerTokenEnvVar: z.string().trim().min(1).optional(),
    headers: z
      .array(
        z.object({
          key: z.string().trim().min(1, "Header name is required."),
          value: z.string().trim().min(1, "Header value is required."),
        }),
      )
      .default([]),
    headersFromEnv: z
      .array(
        z.object({
          key: z.string().trim().min(1, "Header name is required."),
          value: z
            .string()
            .trim()
            .min(1, "Environment variable name is required."),
        }),
      )
      .default([]),
    url: z.string().trim().url("Enter a valid URL."),
  }),
  catalogId: optionalCatalogId,
  id: z.string().trim().min(1).optional(),
  isEnabled: z.boolean(),
  name: z.string().trim().min(1, "Server name is required."),
  transport: z.literal("http"),
});

const mcpStdioUpsertSchema = z.object({
  config: z.object({
    args: z
      .array(z.string().trim().min(1, "Argument cannot be empty."))
      .default([]),
    command: z.string().trim().min(1, "Command is required."),
    cwd: z.string().trim().min(1).optional(),
    envPassthrough: z
      .array(z.string().trim().min(1, "Variable name is required."))
      .default([]),
    envVars: z
      .array(
        z.object({
          key: z
            .string()
            .trim()
            .min(1, "Environment variable name is required."),
          value: z
            .string()
            .trim()
            .min(1, "Environment variable value is required."),
        }),
      )
      .default([]),
  }),
  catalogId: optionalCatalogId,
  id: z.string().trim().min(1).optional(),
  isEnabled: z.boolean(),
  name: z.string().trim().min(1, "Server name is required."),
  transport: z.literal("stdio"),
});

export const mcpServerUpsertSchema = z.discriminatedUnion("transport", [
  mcpHttpUpsertSchema,
  mcpStdioUpsertSchema,
]);

export const mcpServerFormSchema = z.discriminatedUnion("transport", [
  z.object({
    bearerTokenEnvVar: optionalText,
    catalogId: optionalCatalogId,
    headers: z.array(keyValueRowSchema).default([]),
    headersFromEnv: z.array(keyValueRowSchema).default([]),
    id: optionalText,
    isEnabled: z.boolean(),
    name: z.string().trim().min(1, "Server name is required."),
    transport: z.literal("http"),
    url: optionalText,
  }),
  z.object({
    args: z.array(valueRowSchema).default([]),
    catalogId: optionalCatalogId,
    command: optionalText,
    cwd: optionalText,
    envPassthrough: z.array(valueRowSchema).default([]),
    envVars: z.array(keyValueRowSchema).default([]),
    id: optionalText,
    isEnabled: z.boolean(),
    name: z.string().trim().min(1, "Server name is required."),
    transport: z.literal("stdio"),
  }),
]);

export const mcpServerGetSchema = z.object({
  id: z.string().trim().min(1),
});

export const mcpServerBeginOAuthSchema = mcpServerGetSchema;

export const mcpServerDeleteSchema = mcpServerGetSchema;

export const mcpServerToggleSchema = z.object({
  id: z.string().trim().min(1),
  isEnabled: z.boolean(),
});

export type McpServerUpsertInput = z.infer<typeof mcpServerUpsertSchema>;
export type McpServerFormValues = z.infer<typeof mcpServerFormSchema>;
export type McpServerHttpFormValues = Extract<
  McpServerFormValues,
  { transport: "http" }
>;
export type McpServerStdioFormValues = Extract<
  McpServerFormValues,
  { transport: "stdio" }
>;

export function normalizeMcpServerFormValues(
  values: McpServerFormValues,
): McpServerUpsertInput {
  if (values.transport === "http") {
    return mcpHttpUpsertSchema.parse({
      catalogId: values.catalogId,
      config: {
        bearerTokenEnvVar: normalizeText(values.bearerTokenEnvVar),
        headers: normalizeKeyValueRows(values.headers),
        headersFromEnv: normalizeKeyValueRows(values.headersFromEnv),
        url: values.url.trim(),
      },
      id: normalizeText(values.id),
      isEnabled: values.isEnabled,
      name: values.name.trim(),
      transport: values.transport,
    });
  }

  return mcpStdioUpsertSchema.parse({
    catalogId: values.catalogId,
    config: {
      args: normalizeValueRows(values.args),
      command: values.command.trim(),
      cwd: normalizeText(values.cwd),
      envPassthrough: normalizeValueRows(values.envPassthrough),
      envVars: normalizeKeyValueRows(values.envVars),
    },
    id: normalizeText(values.id),
    isEnabled: values.isEnabled,
    name: values.name.trim(),
    transport: values.transport,
  });
}

export function createDefaultMcpServerFormValues(
  transport: "http" | "stdio" = "http",
): McpServerFormValues {
  if (transport === "http") {
    return {
      bearerTokenEnvVar: "",
      headers: [{ key: "", value: "" }],
      headersFromEnv: [{ key: "", value: "" }],
      id: "",
      isEnabled: true,
      name: "",
      transport,
      url: "",
    };
  }

  return {
    args: [{ value: "" }],
    command: "",
    cwd: "",
    envPassthrough: [{ value: "" }],
    envVars: [{ key: "", value: "" }],
    id: "",
    isEnabled: true,
    name: "",
    transport,
  };
}

export function createCatalogMcpServerFormValues(
  catalogId: McpServerCatalogId,
): McpServerFormValues {
  const catalog = getMcpCatalogEntry(catalogId);

  if (!catalog) {
    throw new Error(`Unknown MCP catalog entry: ${catalogId}`);
  }

  if (catalog.transport === "http") {
    return {
      bearerTokenEnvVar: catalog.config.bearerTokenEnvVar ?? "",
      catalogId,
      headers:
        catalog.config.headers.length > 0
          ? catalog.config.headers
          : [{ key: "", value: "" }],
      headersFromEnv:
        catalog.config.headersFromEnv.length > 0
          ? catalog.config.headersFromEnv
          : [{ key: "", value: "" }],
      id: "",
      isEnabled: true,
      name: catalog.name,
      transport: "http",
      url: catalog.config.url,
    };
  }

  return {
    args:
      catalog.config.args.length > 0
        ? catalog.config.args.map((value) => ({ value }))
        : [{ value: "" }],
    catalogId,
    command: catalog.config.command,
    cwd: catalog.config.cwd ?? "",
    envPassthrough:
      catalog.config.envPassthrough.length > 0
        ? catalog.config.envPassthrough.map((value) => ({ value }))
        : [{ value: "" }],
    envVars:
      catalog.config.envVars.length > 0
        ? catalog.config.envVars
        : [{ key: "", value: "" }],
    id: "",
    isEnabled: true,
    name: catalog.name,
    transport: "stdio",
  };
}

export function mcpConfigToFormValues(args: {
  catalogId?: McpServerCatalogId | null;
  config: McpHttpConfig | McpStdioConfig;
  id: string;
  isEnabled: boolean;
  name: string;
  transport: "http" | "stdio";
}): McpServerFormValues {
  if (args.transport === "http") {
    const config = args.config as McpHttpConfig;
    return {
      bearerTokenEnvVar: config.bearerTokenEnvVar ?? "",
      catalogId: args.catalogId ?? undefined,
      headers:
        config.headers.length > 0 ? config.headers : [{ key: "", value: "" }],
      headersFromEnv:
        config.headersFromEnv.length > 0
          ? config.headersFromEnv
          : [{ key: "", value: "" }],
      id: args.id,
      isEnabled: args.isEnabled,
      name: args.name,
      transport: args.transport,
      url: config.url,
    };
  }

  const config = args.config as McpStdioConfig;
  return {
    args:
      config.args.length > 0
        ? config.args.map((value) => ({ value }))
        : [{ value: "" }],
    catalogId: args.catalogId ?? undefined,
    command: config.command,
    cwd: config.cwd ?? "",
    envPassthrough:
      config.envPassthrough.length > 0
        ? config.envPassthrough.map((value) => ({ value }))
        : [{ value: "" }],
    envVars:
      config.envVars.length > 0 ? config.envVars : [{ key: "", value: "" }],
    id: args.id,
    isEnabled: args.isEnabled,
    name: args.name,
    transport: args.transport,
  };
}
