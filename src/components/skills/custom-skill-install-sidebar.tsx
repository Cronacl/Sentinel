"use client";

import { Button, Form, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Cancel01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import {
  ControlledSelectField,
  ControlledTextAreaField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { useRightSidebar } from "@/components/shell/shell-context";
import { buildInstallSteps } from "@/lib/skills/registry";
import {
  customSkillInstallFormSchema,
  type CustomSkillInstallFormValues,
} from "@/schemas/skill-install.schema";
import { api } from "@/trpc/react";

type CustomSkillInstallSidebarProps = {
  createSkillHref: string;
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

function createDefaultValues(): CustomSkillInstallFormValues {
  return {
    installInstructions: "",
    name: "",
    ref: "main",
    repoUrl: "",
    scope: "global",
    skillPath: "",
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function CustomSkillInstallSidebar({
  createSkillHref,
}: CustomSkillInstallSidebarProps) {
  const { close } = useRightSidebar();
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");
  const installCustom = api.skills.installCustom.useMutation();
  const form = useForm<CustomSkillInstallFormValues>({
    defaultValues: createDefaultValues(),
    resolver: zodResolver(customSkillInstallFormSchema),
  });

  const repoUrl = form.watch("repoUrl");
  const skillPath = form.watch("skillPath");
  const ref = form.watch("ref");
  const installInstructions = form.watch("installInstructions");

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
      await installCustom.mutateAsync(values);
      await Promise.all([
        utils.skills.list.invalidate(),
        utils.skills.registry.invalidate(),
      ]);
      close();
    } catch (error) {
      setSubmitError(
        getErrorMessage(error, "Unable to install this custom skill."),
      );
    }
  };

  const isBusy = form.formState.isSubmitting || installCustom.isPending;
  const createSkillIsExternal = createSkillHref.startsWith("http");

  return (
    <div className="flex h-full w-full flex-col bg-transparent">
      <div className="flex items-start justify-between gap-4 px-7 pb-5 pt-8">
        <div className="min-w-0">
          <h2 className="text-[22px] font-medium text-foreground/78">
            Install skill
          </h2>
          <p className="mt-1.5 text-[13px] text-muted/90">
            Pull a skill from GitHub and optionally override the install
            commands that run locally.
          </p>
        </div>
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted/80 transition-colors hover:text-foreground/80"
          onClick={close}
          type="button"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={Cancel01Icon}
            size={16}
            strokeWidth={1.5}
          />
        </button>
      </div>

      <div className="sentinel-scroll-shell min-h-0 flex-1">
        <div className="sentinel-scroll-area h-full">
          <Form
            className="flex min-h-full flex-col px-7 gap-4 pb-6"
            onSubmit={form.handleSubmit(handleSave)}
          >
            <div className="flex flex-col gap-5">
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
                description="Folder name that will be created under .sentinel/skills."
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

              <div className="grid gap-4 sm:grid-cols-2">
                <ControlledTextField
                  control={form.control}
                  description="Branch, tag, or commit SHA."
                  inputProps={{ placeholder: "main" }}
                  label="Git ref"
                  name="ref"
                />

                <ControlledSelectField
                  control={form.control}
                  description="Where this skill should be installed."
                  label="Install scope"
                  name="scope"
                  options={SCOPE_OPTIONS}
                />
              </div>

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

              <div className="border-separator bg-background/60 rounded-2xl border p-3">
                <p className="text-foreground text-sm font-medium">
                  Install preview
                </p>
                <p className="text-muted mt-1 text-xs">
                  {previewSteps.length
                    ? "These commands will run during installation."
                    : "Enter a repo URL, ref, and skill path to preview the generated commands."}
                </p>
                {previewSteps.length ? (
                  <pre className="text-foreground mt-3 overflow-x-auto rounded-xl border border-border/60 bg-background px-3 py-2 text-xs">
                    {previewSteps.join("\n")}
                  </pre>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                isDisabled={isBusy}
                onPress={close}
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

            <div className="border-separator bg-surface/60  rounded-2xl border p-4 pt-4 ">
              <p className="text-foreground text-sm font-medium">
                Create a skill from scratch
              </p>
              <p className="text-muted mt-1 text-xs">
                Need to author your own skill instead of installing one? Follow
                the instructions below.
              </p>
              <Link
                className="text-primary mt-3 inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
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
          </Form>
        </div>
      </div>
    </div>
  );
}
