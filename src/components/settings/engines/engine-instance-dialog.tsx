"use client";

import {
  Button,
  Description,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { useState } from "react";
import { sileo } from "sileo";

import { EngineIcon } from "@/components/engines/descriptors";
import { getDriverLabel } from "@/lib/ai/chat/engines/catalog";
import type { EngineInstanceSummary } from "@/lib/ai/chat/engines/contract";
import { getErrorMessage } from "@/lib/errors";
import { api } from "@/trpc/react";

import { EngineEnvEditor } from "./engine-env-editor";
import {
  ENGINE_ACCENT_PRESETS,
  buildCreateInstanceInput,
  buildUpdateInstancePatch,
  draftFromSummary,
  emptyInstanceFormDraft,
  getDriverHomeEnvVar,
  getHomeChangeNotice,
  getInstanceIsolationNote,
  isEngineAccentColor,
  validateInstanceFormDraft,
  type InstanceFormDraft,
} from "./instance-management";

export type EngineInstanceDialogTarget =
  | { driver: string; mode: "create" }
  | { mode: "edit"; summary: EngineInstanceSummary };

/** Refetches everything that lists instances after a change. */
export function useInvalidateEngineInstances() {
  const utils = api.useUtils();
  return async () => {
    await Promise.all([
      utils.engines.instances.list.invalidate(),
      utils.engines.snapshots.invalidate(),
      utils.engines.composerCatalog.invalidate(),
      utils.engines.models.invalidate(),
    ]);
  };
}

function AccentColorPicker({
  onChange,
  value,
}: {
  onChange: (value: string | null) => void;
  value: string | null;
}) {
  const [custom, setCustom] = useState(
    value && !(ENGINE_ACCENT_PRESETS as readonly string[]).includes(value)
      ? value
      : "",
  );
  const swatch =
    "size-5 rounded-full border transition-transform duration-150 ease-out hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Accent colour</Label>
      <div
        aria-label="Accent colour"
        className="flex flex-wrap items-center gap-1.5"
        role="radiogroup"
      >
        <button
          aria-checked={value === null}
          aria-label="No accent colour"
          className={`${swatch} bg-default ${value === null ? "border-foreground" : "border-border"}`}
          onClick={() => onChange(null)}
          role="radio"
          type="button"
        />
        {ENGINE_ACCENT_PRESETS.map((color) => (
          <button
            aria-checked={value === color}
            aria-label={color}
            className={`${swatch} ${value === color ? "border-foreground" : "border-transparent"}`}
            key={color}
            onClick={() => onChange(color)}
            role="radio"
            style={{ backgroundColor: color }}
            type="button"
          />
        ))}
        <Input
          aria-label="Custom accent colour"
          className="w-24 font-mono text-xs"
          onChange={(event) => {
            const next = event.target.value.trim();
            setCustom(next);
            if (isEngineAccentColor(next)) {
              onChange(next.toLowerCase());
            }
          }}
          placeholder="#rrggbb"
          spellCheck={false}
          value={custom}
          variant="secondary"
        />
      </div>
      <Description>
        Marks this instance in the composer and automations.
      </Description>
    </div>
  );
}

function PathField({
  description,
  label,
  onChange,
  placeholder,
  value,
}: {
  description: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <TextField.Root fullWidth onChange={onChange} value={value}>
      <Label>{label}</Label>
      <Input.Root
        className="font-mono text-xs"
        placeholder={placeholder}
        spellCheck={false}
      />
      <Description>{description}</Description>
    </TextField.Root>
  );
}

function InstanceForm({
  onClose,
  target,
}: {
  onClose: () => void;
  target: EngineInstanceDialogTarget;
}) {
  const driver =
    target.mode === "create" ? target.driver : target.summary.driver;
  const driverLabel = getDriverLabel(driver);
  const homeEnvVar = getDriverHomeEnvVar(driver);
  const [draft, setDraft] = useState<InstanceFormDraft>(() =>
    target.mode === "create"
      ? emptyInstanceFormDraft()
      : draftFromSummary(target.summary),
  );
  const [error, setError] = useState("");
  const createMutation = api.engines.instances.create.useMutation();
  const updateMutation = api.engines.instances.update.useMutation();
  const invalidate = useInvalidateEngineInstances();
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isolationNote = getInstanceIsolationNote(driver);
  const homeNotice =
    target.mode === "edit" ? getHomeChangeNotice(target.summary, draft) : null;

  const set = (patch: Partial<InstanceFormDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const handleSave = async () => {
    const problem = validateInstanceFormDraft(draft, driver);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");

    try {
      if (target.mode === "create") {
        const created = await createMutation.mutateAsync(
          buildCreateInstanceInput(driver, draft),
        );
        sileo.success({ description: `${created.label} added.` });
      } else {
        const patch = buildUpdateInstancePatch(target.summary, draft);
        if (Object.keys(patch).length > 0) {
          await updateMutation.mutateAsync({
            instanceId: target.summary.id,
            patch,
          });
          sileo.success({ description: `${target.summary.label} saved.` });
        }
      }
      await invalidate();
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to save the instance."));
    }
  };

  return (
    <>
      <Modal.Header className="items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <EngineIcon className="h-4 w-4 shrink-0" driver={driver} />
          <div>
            <Modal.Heading className="text-base">
              {target.mode === "create"
                ? `Add a ${driverLabel} instance`
                : `Edit ${target.summary.label}`}
            </Modal.Heading>
            {target.mode === "edit" && !target.summary.isDefault ? (
              <p className="text-muted mt-0.5 font-mono text-xs">
                {target.summary.id}
              </p>
            ) : null}
          </div>
        </div>
        <Modal.CloseTrigger />
      </Modal.Header>

      <Modal.Body className="p-2">
        <div className="flex flex-col gap-5">
          {error ? (
            <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
              {error}
            </p>
          ) : null}

          <TextField.Root
            fullWidth
            onChange={(label) => set({ label })}
            value={draft.label}
          >
            <Label>Name</Label>
            <Input.Root placeholder={`${driverLabel} work`} />
            <Description>
              {target.mode === "create"
                ? "Shown in the composer and automations. Its id is derived from it and cannot change later."
                : "Shown in the composer and automations."}
            </Description>
          </TextField.Root>

          <AccentColorPicker
            onChange={(accentColor) => set({ accentColor })}
            value={draft.accentColor}
          />

          <PathField
            description={`Absolute path (or ~/…). Leave empty to find ${driverLabel} on the PATH.`}
            label="Binary path"
            onChange={(binaryPath) => set({ binaryPath })}
            placeholder="/usr/local/bin/…"
            value={draft.binaryPath}
          />

          {homeEnvVar ? (
            <div className="flex flex-col gap-1.5">
              <PathField
                description={`Sets ${homeEnvVar} for this instance: its own sign-in, settings, sessions and skills. Leave empty to use ${driverLabel}'s default home.`}
                label="Home directory"
                onChange={(homePath) => set({ homePath })}
                placeholder={`~/.${driver}-work`}
                value={draft.homePath}
              />
              {homeNotice ? (
                <p className="border-warning/20 bg-warning-soft text-warning-soft-foreground rounded-lg border px-2 py-1 text-[11px]">
                  {homeNotice}
                </p>
              ) : null}
            </div>
          ) : null}

          {isolationNote ? (
            <p className="text-muted text-xs">{isolationNote}</p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label>Environment variables</Label>
            <EngineEnvEditor
              drafts={draft.environment}
              isDisabled={isSaving}
              onChange={(environment) => set({ environment })}
            />
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button
          isDisabled={isSaving}
          onPress={onClose}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          isDisabled={isSaving}
          isPending={isSaving}
          onPress={() => void handleSave()}
          type="button"
        >
          {({ isPending }) => (
            <>
              {isPending ? <Spinner color="current" size="sm" /> : null}
              {target.mode === "create" ? "Add instance" : "Save"}
            </>
          )}
        </Button>
      </Modal.Footer>
    </>
  );
}

/** Add an instance of a driver, or edit one (Settings → Engines). */
export function EngineInstanceDialog({
  onClose,
  target,
}: {
  onClose: () => void;
  target: EngineInstanceDialogTarget | null;
}) {
  const state = useOverlayState({
    isOpen: target !== null,
    onOpenChange: (open) => {
      if (!open) {
        onClose();
      }
    },
  });
  const formKey =
    target === null
      ? "closed"
      : target.mode === "create"
        ? `create:${target.driver}`
        : `edit:${target.summary.id}`;

  return (
    <Modal.Root state={state}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog>
            {target ? (
              <InstanceForm key={formKey} onClose={onClose} target={target} />
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
