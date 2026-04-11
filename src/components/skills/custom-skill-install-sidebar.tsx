"use client";

import { Button, Drawer, Form, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import {
  ControlledSelectField,
  ControlledTextAreaField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { getErrorMessage } from "@/lib/errors";
import { sileo } from "sileo";
import { buildInstallSteps } from "@/lib/skills/registry";
import {
  customSkillInstallFormSchema,
  type CustomSkillInstallFormInputValues,
  type CustomSkillInstallFormValues,
} from "@/schemas/skill-install.schema";
import { api } from "@/trpc/react";

type CustomSkillInstallDrawerProps = {
  codexAvailable: boolean;
  copilotAvailable: boolean;
  createSkillHref: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const SCOPE_OPTIONS = [
  {
    description: "Install under your home-level Sentinel skills directory.",
    label: "Global",
    value: "global",
  },
  {
    description: "Install under the currently selected workspace.",
    label: "Workspace",
    value: "workspace",
  },
] as const;

const TARGET_OPTIONS = [
  {
    description: "Install under Sentinel's managed skills directories.",
    label: "Sentinel",
    value: "sentinel",
  },
  {
    description: "Install under Claude's .claude/skills directories.",
    label: "Claude",
    value: "claude",
  },
  {
    description: "Install under the Codex home skills directory.",
    label: "Codex",
    value: "codex",
  },
  {
    description:
      "Install under Copilot's .github/skills workspace folder or ~/.copilot/skills home folder.",
    label: "Copilot",
    value: "copilot",
  },
] as const;

function createDefaultValues(): CustomSkillInstallFormInputValues {
  return {
    installInstructions: "",
    name: "",
    ref: "main",
    repoUrl: "",
    scope: "global",
    target: "sentinel",
    skillPath: "",
  };
}

function CustomSkillInstallDrawerContent({
  codexAvailable,
  copilotAvailable,
  createSkillHref,
  onClose,
}: {
  codexAvailable: boolean;
  copilotAvailable: boolean;
  createSkillHref: string;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");
  const installCustom = api.skills.installCustom.useMutation();
  const form = useForm<
    CustomSkillInstallFormInputValues,
    undefined,
    CustomSkillInstallFormValues
  >({
    defaultValues: createDefaultValues(),
    resolver: zodResolver(customSkillInstallFormSchema),
  });

  const repoUrl = form.watch("repoUrl");
  const skillPath = form.watch("skillPath");
  const ref = form.watch("ref");
  const installInstructions = form.watch("installInstructions");
  const target = form.watch("target");

  useEffect(() => {
    if (target === "codex" && form.getValues("scope") === "workspace") {
      form.setValue("scope", "global");
    }
  }, [form, target]);

  const previewSteps = useMemo(() => {
    const manualSteps = installInstructions
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (manualSteps.length > 0) {
      return manualSteps;
    }

    try {
      if (!repoUrl.trim() || !skillPath.trim() || !ref.trim()) {
        return [];
      }

      return buildInstallSteps(repoUrl.trim(), skillPath.trim(), ref.trim());
    } catch {
      return [];
    }
  }, [installInstructions, ref, repoUrl, skillPath]);

  const handleSave = async (values: CustomSkillInstallFormValues) => {
    setSubmitError("");

    try {
      const result = await installCustom.mutateAsync(values);
      await Promise.all([
        utils.skills.list.invalidate(),
        utils.skills.registry.invalidate(),
      ]);
      sileo.success({
        description: result.alreadyInstalled
          ? "Skill already installed. Refreshed skill state."
          : "Custom skill installed.",
      });
      onClose();
    } catch (error) {
      setSubmitError(
        getErrorMessage(error, "Unable to install this custom skill."),
      );
    }
  };

  const isBusy = form.formState.isSubmitting || installCustom.isPending;
  const createSkillIsExternal = createSkillHref.startsWith("http");

  return (
    <Form className="contents" onSubmit={form.handleSubmit(handleSave)}>
      <Drawer.Header className="flex-col items-start gap-0 pb-0">
        <Drawer.Heading className="text-base">Install skill</Drawer.Heading>
        <p className="mt-1.5 text-[13px] text-foreground/70">
          Pull a skill from GitHub and optionally override the install commands
          that run locally.
        </p>
      </Drawer.Header>

      <Drawer.Body className="flex flex-col gap-5">
        {submitError ? (
          <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
            {submitError}
          </p>
        ) : null}

        <div className="border-warning/20 bg-warning-soft text-warning-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
          Custom install commands are executed locally. Use{" "}
          <code className="font-mono">{"{{DEST}}"}</code> as the target
          directory placeholder when overriding the defaults.
        </div>

        <ControlledTextField
          control={form.control}
          description="Folder name that will be created in the selected runtime's skills directory."
          inputProps={{ placeholder: "my-skill" }}
          label="Skill name"
          name="name"
        />

        <ControlledTextField
          control={form.control}
          description="GitHub repository to install from."
          inputProps={{
            placeholder: "https://github.com/openai/skills",
          }}
          label="Repository URL"
          name="repoUrl"
        />

        <ControlledTextField
          control={form.control}
          description="Branch, tag, or commit SHA."
          inputProps={{ placeholder: "main" }}
          label="Git ref"
          name="ref"
        />

        <ControlledSelectField
          control={form.control}
          description="Which runtime should receive this skill."
          label="Install target"
          name="target"
          options={TARGET_OPTIONS.map((option) => ({
            ...option,
            isDisabled:
              (option.value === "codex" && !codexAvailable) ||
              (option.value === "copilot" && !copilotAvailable),
          }))}
        />

        <ControlledSelectField
          control={form.control}
          description={
            target === "codex"
              ? "Codex installs are global-only."
              : target === "copilot"
                ? "Copilot installs use ~/.copilot/skills globally and .github/skills in a workspace."
                : "Where this skill should be installed."
          }
          label="Install scope"
          name="scope"
          options={SCOPE_OPTIONS}
          selectProps={{ isDisabled: target === "codex" }}
        />

        <ControlledTextField
          control={form.control}
          description="Repo-relative path to the skill directory that contains SKILL.md."
          inputProps={{ placeholder: "skills/.curated/gh-fix-ci" }}
          label="Skill path"
          name="skillPath"
        />

        <ControlledTextAreaField
          control={form.control}
          description="Optional. One shell command per line. Leave empty to use the generated GitHub archive install flow."
          label="Install commands override"
          name="installInstructions"
          textAreaProps={{ rows: 5 }}
        />

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            Install preview
          </h3>
          <p className="text-xs text-muted">
            {previewSteps.length
              ? "These commands will run during installation."
              : "Enter a repo URL, ref, and skill path to preview the generated commands."}
          </p>
          {previewSteps.length ? (
            <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background px-3 py-2 text-xs text-foreground">
              {previewSteps.join("\n")}
            </pre>
          ) : null}
        </div>

        <hr className="border-border/50" />

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            Create a skill from scratch
          </h3>
          <p className="text-xs text-muted">
            Need to author your own skill instead of installing one? Follow the
            instructions below.
          </p>
          <Link
            className="text-primary inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
            href={createSkillHref}
            prefetch={!createSkillIsExternal}
            rel={createSkillIsExternal ? "noopener noreferrer" : undefined}
            target={createSkillIsExternal ? "_blank" : undefined}
          >
            <HugeiconsIcon
              color="currentColor"
              icon={LinkSquare02Icon}
              size={16}
              strokeWidth={1.5}
            />
            View skill creation instructions
          </Link>
        </div>
      </Drawer.Body>

      <Drawer.Footer>
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            isDisabled={isBusy}
            onPress={onClose}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button isDisabled={isBusy} isPending={isBusy} type="submit">
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : null}
                Install skill
              </>
            )}
          </Button>
        </div>
      </Drawer.Footer>
    </Form>
  );
}

export function CustomSkillInstallDrawer({
  codexAvailable,
  copilotAvailable,
  createSkillHref,
  isOpen,
  onOpenChange,
}: CustomSkillInstallDrawerProps) {
  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="rounded-none bg-background dark:bg-surface">
          <Drawer.CloseTrigger />
          <CustomSkillInstallDrawerContent
            codexAvailable={codexAvailable}
            copilotAvailable={copilotAvailable}
            createSkillHref={createSkillHref}
            onClose={() => onOpenChange(false)}
          />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
