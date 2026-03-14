"use client";

import { Button, Input, TextField } from "@heroui/react";
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import type {
  FieldValues,
  Path,
  UseFormRegister,
  UseFormReturn,
} from "react-hook-form";

import type {
  McpServerHttpFormValues,
  McpServerStdioFormValues,
} from "@/schemas/mcp-server.schema";

type KeyValueRow = { key: string; value: string };
type ValueRow = { value: string };

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-foreground text-sm font-medium">{children}</h3>;
}

function KeyValueRows<
  TFormValues extends FieldValues,
  TFieldPrefix extends Path<TFormValues>,
>({
  fieldPrefix,
  isBusy,
  onRemove,
  register,
  rows,
}: {
  fieldPrefix: TFieldPrefix;
  isBusy: boolean;
  onRemove: (index: number) => void;
  register: UseFormRegister<TFormValues>;
  rows: KeyValueRow[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((_, index) => (
        <div
          className="grid grid-cols-[1fr_1fr_auto] gap-2"
          key={`${fieldPrefix}-${index}`}
        >
          <Input
            {...register(`${fieldPrefix}.${index}.key` as Path<TFormValues>)}
            placeholder="Key"
            variant="secondary"
          />
          <Input
            {...register(`${fieldPrefix}.${index}.value` as Path<TFormValues>)}
            placeholder="Value"
            variant="secondary"
          />
          <Button
            isDisabled={isBusy}
            isIconOnly
            onPress={() => onRemove(index)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={Delete02Icon}
              size={15}
              strokeWidth={1.5}
            />
          </Button>
        </div>
      ))}
    </div>
  );
}

function ValueRows<
  TFormValues extends FieldValues,
  TFieldPrefix extends Path<TFormValues>,
>({
  fieldPrefix,
  isBusy,
  onRemove,
  placeholder = "Value",
  register,
  rows,
}: {
  fieldPrefix: TFieldPrefix;
  isBusy: boolean;
  onRemove: (index: number) => void;
  placeholder?: string;
  register: UseFormRegister<TFormValues>;
  rows: ValueRow[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((_, index) => (
        <div
          className="grid grid-cols-[1fr_auto] gap-2"
          key={`${fieldPrefix}-${index}`}
        >
          <Input
            {...register(`${fieldPrefix}.${index}.value` as Path<TFormValues>)}
            placeholder={placeholder}
            variant="secondary"
          />
          <Button
            isDisabled={isBusy}
            isIconOnly
            onPress={() => onRemove(index)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={Delete02Icon}
              size={15}
              strokeWidth={1.5}
            />
          </Button>
        </div>
      ))}
    </div>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button
      className="w-full"
      onPress={onPress}
      size="sm"
      type="button"
      variant="tertiary"
    >
      <HugeiconsIcon
        color="currentColor"
        icon={PlusSignIcon}
        size={14}
        strokeWidth={1.5}
      />
      {label}
    </Button>
  );
}

type McpHttpTransportSectionProps = {
  form: UseFormReturn<McpServerHttpFormValues>;
  headers: McpServerHttpFormValues["headers"];
  headersFromEnv: McpServerHttpFormValues["headersFromEnv"];
  isBusy: boolean;
};

export function McpHttpTransportSection({
  form,
  headers,
  headersFromEnv,
  isBusy,
}: McpHttpTransportSectionProps) {
  const setHeaders = (nextHeaders: McpServerHttpFormValues["headers"]) => {
    form.setValue("headers", nextHeaders, { shouldDirty: true });
  };
  const setHeadersFromEnv = (
    nextHeadersFromEnv: McpServerHttpFormValues["headersFromEnv"],
  ) => {
    form.setValue("headersFromEnv", nextHeadersFromEnv, { shouldDirty: true });
  };

  return (
    <div className="space-y-6">
      <TextField fullWidth name="url" type="url">
        <SectionLabel>URL</SectionLabel>
        <Input
          {...form.register("url")}
          placeholder="https://mcp.example.com/mcp"
          variant="secondary"
        />
      </TextField>

      <TextField fullWidth name="bearerTokenEnvVar">
        <SectionLabel>Bearer token env var</SectionLabel>
        <Input
          {...form.register("bearerTokenEnvVar")}
          placeholder="MCP_BEARER_TOKEN"
          variant="secondary"
        />
      </TextField>

      <div className="space-y-3">
        <SectionLabel>Headers</SectionLabel>
        <KeyValueRows<McpServerHttpFormValues, "headers">
          fieldPrefix="headers"
          isBusy={isBusy}
          onRemove={(index) =>
            setHeaders(headers.filter((_, rowIndex) => rowIndex !== index))
          }
          register={form.register}
          rows={headers}
        />
        <AddButton
          label="Add header"
          onPress={() => setHeaders([...headers, { key: "", value: "" }])}
        />
      </div>

      <div className="space-y-3">
        <SectionLabel>Headers from environment variables</SectionLabel>
        <KeyValueRows<McpServerHttpFormValues, "headersFromEnv">
          fieldPrefix="headersFromEnv"
          isBusy={isBusy}
          onRemove={(index) =>
            setHeadersFromEnv(
              headersFromEnv.filter((_, rowIndex) => rowIndex !== index),
            )
          }
          register={form.register}
          rows={headersFromEnv}
        />
        <AddButton
          label="Add variable"
          onPress={() =>
            setHeadersFromEnv([...headersFromEnv, { key: "", value: "" }])
          }
        />
      </div>
    </div>
  );
}

type McpStdioTransportSectionProps = {
  args: McpServerStdioFormValues["args"];
  envPassthrough: McpServerStdioFormValues["envPassthrough"];
  envVars: McpServerStdioFormValues["envVars"];
  form: UseFormReturn<McpServerStdioFormValues>;
  isBusy: boolean;
};

export function McpStdioTransportSection({
  args,
  envPassthrough,
  envVars,
  form,
  isBusy,
}: McpStdioTransportSectionProps) {
  const setArgs = (nextArgs: McpServerStdioFormValues["args"]) => {
    form.setValue("args", nextArgs, { shouldDirty: true });
  };
  const setEnvVars = (nextEnvVars: McpServerStdioFormValues["envVars"]) => {
    form.setValue("envVars", nextEnvVars, { shouldDirty: true });
  };
  const setEnvPassthrough = (
    nextEnvPassthrough: McpServerStdioFormValues["envPassthrough"],
  ) => {
    form.setValue("envPassthrough", nextEnvPassthrough, {
      shouldDirty: true,
    });
  };

  return (
    <div className="space-y-6">
      <TextField fullWidth name="command">
        <SectionLabel>Command to launch</SectionLabel>
        <Input
          {...form.register("command")}
          placeholder="openai-dev-mcp serve-sqlite"
          variant="secondary"
        />
      </TextField>

      <div className="space-y-3">
        <SectionLabel>Arguments</SectionLabel>
        <ValueRows<McpServerStdioFormValues, "args">
          fieldPrefix="args"
          isBusy={isBusy}
          onRemove={(index) =>
            setArgs(args.filter((_, rowIndex) => rowIndex !== index))
          }
          placeholder="Argument"
          register={form.register}
          rows={args}
        />
        <AddButton
          label="Add argument"
          onPress={() => setArgs([...args, { value: "" }])}
        />
      </div>

      <div className="space-y-3">
        <SectionLabel>Environment variables</SectionLabel>
        <KeyValueRows<McpServerStdioFormValues, "envVars">
          fieldPrefix="envVars"
          isBusy={isBusy}
          onRemove={(index) =>
            setEnvVars(envVars.filter((_, rowIndex) => rowIndex !== index))
          }
          register={form.register}
          rows={envVars}
        />
        <AddButton
          label="Add environment variable"
          onPress={() => setEnvVars([...envVars, { key: "", value: "" }])}
        />
      </div>

      <div className="space-y-3">
        <SectionLabel>Environment variable passthrough</SectionLabel>
        <ValueRows<McpServerStdioFormValues, "envPassthrough">
          fieldPrefix="envPassthrough"
          isBusy={isBusy}
          onRemove={(index) =>
            setEnvPassthrough(
              envPassthrough.filter((_, rowIndex) => rowIndex !== index),
            )
          }
          placeholder="ENV_VAR_NAME"
          register={form.register}
          rows={envPassthrough}
        />
        <AddButton
          label="Add variable"
          onPress={() => setEnvPassthrough([...envPassthrough, { value: "" }])}
        />
      </div>

      <TextField fullWidth name="cwd">
        <SectionLabel>Working directory</SectionLabel>
        <Input
          {...form.register("cwd")}
          placeholder="~/code"
          variant="secondary"
        />
      </TextField>
    </div>
  );
}
