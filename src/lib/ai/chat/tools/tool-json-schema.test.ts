import { describe, expect, it, mock } from "bun:test";
import { asSchema, type Tool } from "ai";

mock.module("server-only", () => ({}));

const { getDefaultToolApprovalPolicies } = await import("./policy");
const { buildTools } = await import("./index");
const { loadIntegrationTools } = await import("@/lib/integrations/registry");
const { INTEGRATION_PROVIDERS } = await import("@/server/db/enums");

type JsonSchemaNode = Record<string, unknown>;

// Options that switch on every built-in tool group: filesystem, mutation,
// execution, media generation, browser, computer, memory, skills, task and
// delegation.
function createOptions(overrides: Record<string, unknown> = {}) {
  const toolApprovalPolicies = getDefaultToolApprovalPolicies();

  return {
    agentRole: "primary",
    availableSkills: [{ name: "release-notes" }],
    defaultDirectory: "/tmp/sentinel-tool-schema",
    imageGenerationRuntime: {
      defaultProvider: "openai",
      providers: { openai: {} },
    },
    memoryRuntime: { available: true },
    permissionMode: "default",
    promptContext: {},
    searchProviders: {},
    searchSettings: {
      defaultProvider: "exa",
      defaultResultCount: 5,
      maxResultCount: 10,
    },
    skillRoots: [],
    systemPrompt: "system",
    threadId: "thread-1",
    threadMode: "chat",
    toolApprovalPolicies,
    toolsEnabled: true,
    userId: "user-1",
    videoGenerationRuntime: {
      defaultProvider: "fal",
      providers: { fal: {} },
    },
    webFetchSettings: { batchEnabled: true, batchLimit: 10 },
    workspaceId: null,
    ...overrides,
  } as any;
}

// The JSON Schema each tool's input schema turns into when the AI SDK sends it
// to a model provider. Serializing drops non-enumerable extras (zod 4 attaches
// a `~standard` property) so the snapshot matches the request payload.
async function toProviderJsonSchemas(tools: Record<string, Tool | undefined>) {
  const entries = await Promise.all(
    Object.entries(tools)
      .filter((entry): entry is [string, Tool] => entry[1] !== undefined)
      .map(async ([name, tool]) => {
        const jsonSchema = await asSchema(tool.inputSchema).jsonSchema;
        return [
          name,
          JSON.parse(JSON.stringify(jsonSchema)) as JsonSchemaNode,
        ] as const;
      }),
  );

  return Object.fromEntries(
    entries.sort(([left], [right]) => left.localeCompare(right)),
  );
}

function resolveLocalRef(root: JsonSchemaNode, ref: string) {
  if (ref === "#") return root;
  if (!ref.startsWith("#/")) return undefined;

  return ref
    .slice(2)
    .split("/")
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === "object"
          ? (node as JsonSchemaNode)[segment]
          : undefined,
      root,
    );
}

function collectSchemaProblems(
  root: JsonSchemaNode,
  node: unknown,
  path: string,
  problems: string[],
) {
  if (typeof node === "boolean") return;
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    problems.push(`${path}: not a JSON schema`);
    return;
  }

  const schema = node as JsonSchemaNode;

  if (typeof schema.$ref === "string") {
    if (resolveLocalRef(root, schema.$ref) === undefined) {
      problems.push(`${path}: unresolved $ref ${schema.$ref}`);
    }
  }

  const properties = schema.properties as JsonSchemaNode | undefined;

  if (schema.type === "object") {
    // A record (open object) must keep its value schema; a closed object with
    // no declared properties only accepts {} and silently drops model input.
    if (!properties && schema.additionalProperties === false) {
      problems.push(`${path}: object accepts no properties`);
    }

    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!properties || !(String(key) in properties)) {
          problems.push(`${path}: required key ${String(key)} is not defined`);
        }
      }
    }
  }

  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      collectSchemaProblems(root, value, `${path}.${key}`, problems);
    }
  }

  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    collectSchemaProblems(
      root,
      schema.additionalProperties,
      `${path}{*}`,
      problems,
    );
  }

  if (schema.items) {
    const items = Array.isArray(schema.items) ? schema.items : [schema.items];
    items.forEach((item, index) =>
      collectSchemaProblems(root, item, `${path}[${index}]`, problems),
    );
  }

  for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
    const variants = schema[keyword];
    if (Array.isArray(variants)) {
      variants.forEach((variant, index) =>
        collectSchemaProblems(
          root,
          variant,
          `${path}.${keyword}[${index}]`,
          problems,
        ),
      );
    }
  }
}

function expectValidToolInputSchemas(schemas: Record<string, JsonSchemaNode>) {
  const problems: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    if (schema.type !== "object") {
      problems.push(`${name}: input schema is not an object schema`);
    }
    if (!schema.properties || typeof schema.properties !== "object") {
      problems.push(`${name}: input schema has no properties map`);
    }
    collectSchemaProblems(schema, schema, name, problems);
  }

  expect(problems).toEqual([]);
}

describe("tool input JSON schemas", () => {
  it("converts every built-in chat tool to a valid object schema", async () => {
    const schemas = await toProviderJsonSchemas(buildTools(createOptions()));

    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(["load_skill", "save_memory", "shell_command"]),
    );
    expectValidToolInputSchemas(schemas);
    expect(schemas).toMatchSnapshot();
  });

  it("converts every plan-mode tool to a valid object schema", async () => {
    const schemas = await toProviderJsonSchemas(
      buildTools(createOptions({ threadMode: "plan" })),
    );

    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(["ask_question", "create_plan", "update_plan"]),
    );
    expectValidToolInputSchemas(schemas);
    expect(schemas).toMatchSnapshot();
  });

  it("converts every integration tool to a valid object schema", async () => {
    const tools = await loadIntegrationTools(
      [...INTEGRATION_PROVIDERS],
      { databases: {}, tokens: {} },
      () => false,
    );
    const schemas = await toProviderJsonSchemas(tools);

    expect(Object.keys(schemas).length).toBeGreaterThan(100);
    expectValidToolInputSchemas(schemas);
    expect(schemas).toMatchSnapshot();
  });
});
