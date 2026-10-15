"use client";

import {
  Button,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  Spinner,
  useOverlayState,
} from "@heroui/react";
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { sileo } from "sileo";

import type {
  EngineInstanceSummary,
  EngineModel,
} from "@/lib/ai/chat/engines/contract";
import { getErrorMessage } from "@/lib/errors";
import { api } from "@/trpc/react";

import { useInvalidateEngineInstances } from "./engine-instance-dialog";
import {
  KEEP_OPTIONS,
  NO_OPTIONS,
  emptyCustomModelDraft,
  getCustomModelIdHint,
  getOptionTemplateModels,
  toCustomModelDrafts,
  toCustomModels,
  type CustomModelDraft,
} from "./instance-management";

export type EngineCustomModelsTarget = {
  /** What the engine reports, to copy option descriptors from. */
  models: EngineModel[];
  summary: EngineInstanceSummary;
};

function OptionsSourceSelect({
  draft,
  onChange,
  templates,
}: {
  draft: CustomModelDraft;
  onChange: (optionsFrom: string) => void;
  templates: EngineModel[];
}) {
  const choices = [
    ...(draft.options?.length
      ? [
          {
            label: `Current options (${draft.options.length})`,
            value: KEEP_OPTIONS,
          },
        ]
      : []),
    { label: "No options", value: NO_OPTIONS },
    ...templates.map((model) => ({
      label: `Same as ${model.name}`,
      value: model.id,
    })),
  ];
  const selected =
    choices.find((choice) => choice.value === draft.optionsFrom) ?? null;

  return (
    <Select.Root
      aria-label={`Options of ${draft.id || "the custom model"}`}
      onSelectionChange={(key) => {
        if (key != null) {
          onChange(String(key));
        }
      }}
      selectedKey={selected?.value ?? null}
    >
      <Select.Trigger>
        <Select.Value>
          {() => <span className="text-xs">{selected?.label ?? ""}</span>}
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {choices.map((choice) => (
            <ListBox.Item
              id={choice.value}
              key={choice.value}
              textValue={choice.label}
            >
              <span className="text-xs">{choice.label}</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select.Root>
  );
}

function CustomModelsForm({
  onClose,
  target,
}: {
  onClose: () => void;
  target: EngineCustomModelsTarget;
}) {
  const { summary } = target;
  const [drafts, setDrafts] = useState(() =>
    toCustomModelDrafts(summary.customModels),
  );
  const [error, setError] = useState("");
  const updateMutation = api.engines.instances.update.useMutation();
  const invalidate = useInvalidateEngineInstances();
  const templates = useMemo(
    () => getOptionTemplateModels(target.models),
    [target.models],
  );
  const idHint = getCustomModelIdHint(
    target.models.filter((model) => model.source !== "custom"),
  );

  const update = (key: string, patch: Partial<CustomModelDraft>) =>
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? { ...draft, ...patch } : draft,
      ),
    );

  const handleSave = async () => {
    const result = toCustomModels(drafts, templates);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError("");
    try {
      await updateMutation.mutateAsync({
        instanceId: summary.id,
        patch: { customModels: result.customModels },
      });
      await invalidate();
      sileo.success({ description: `${summary.label} models saved.` });
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to save the models."));
    }
  };

  return (
    <>
      <Modal.Header className="items-start justify-between gap-4">
        <div>
          <Modal.Heading className="text-base">
            Custom models: {summary.label}
          </Modal.Heading>
          <p className="text-muted mt-1 text-sm">
            Models this instance offers besides the ones {summary.label}{" "}
            reports. Pick a reported model to copy its reasoning and other
            options.
          </p>
        </div>
        <Modal.CloseTrigger />
      </Modal.Header>

      <Modal.Body className="p-2">
        <div className="flex flex-col gap-3">
          {error ? (
            <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
              {error}
            </p>
          ) : null}

          {drafts.length > 0 ? (
            <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,3fr)_minmax(0,3fr)_auto] items-center gap-1.5">
              <Label className="text-xs">Model id</Label>
              <Label className="text-xs">Display name</Label>
              <Label className="text-xs">Options</Label>
              <span />
              {drafts.map((draft, index) => (
                <div className="contents" key={draft.key}>
                  <Input
                    aria-label={`Id of custom model ${index + 1}`}
                    className="font-mono text-xs"
                    onChange={(event) =>
                      update(draft.key, { id: event.target.value })
                    }
                    placeholder="model-id"
                    spellCheck={false}
                    value={draft.id}
                    variant="secondary"
                  />
                  <Input
                    aria-label={`Name of custom model ${index + 1}`}
                    className="text-xs"
                    onChange={(event) =>
                      update(draft.key, { name: event.target.value })
                    }
                    placeholder={draft.id || "Display name"}
                    value={draft.name}
                    variant="secondary"
                  />
                  <OptionsSourceSelect
                    draft={draft}
                    onChange={(optionsFrom) =>
                      update(draft.key, { optionsFrom })
                    }
                    templates={templates}
                  />
                  <Button
                    aria-label={`Remove custom model ${draft.id || index + 1}`}
                    isIconOnly
                    onPress={() =>
                      setDrafts((current) =>
                        current.filter((item) => item.key !== draft.key),
                      )
                    }
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
          ) : (
            <p className="text-muted text-xs">No custom models yet.</p>
          )}

          <Button
            className="w-full"
            onPress={() =>
              setDrafts((current) => [...current, emptyCustomModelDraft()])
            }
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
            Add model
          </Button>
          <p className="text-muted text-[11px]">
            {idHint} A model the engine already reports keeps its place and
            takes the name and options given here.
          </p>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button
          isDisabled={updateMutation.isPending}
          onPress={onClose}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          isDisabled={updateMutation.isPending}
          isPending={updateMutation.isPending}
          onPress={() => void handleSave()}
          type="button"
        >
          {({ isPending }) => (
            <>
              {isPending ? <Spinner color="current" size="sm" /> : null}
              Save
            </>
          )}
        </Button>
      </Modal.Footer>
    </>
  );
}

/** Edits engine_instance.custom_models for one instance. */
export function EngineCustomModelsDialog({
  onClose,
  target,
}: {
  onClose: () => void;
  target: EngineCustomModelsTarget | null;
}) {
  const state = useOverlayState({
    isOpen: target !== null,
    onOpenChange: (open) => {
      if (!open) {
        onClose();
      }
    },
  });

  return (
    <Modal.Root state={state}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog>
            {target ? (
              <CustomModelsForm
                key={target.summary.id}
                onClose={onClose}
                target={target}
              />
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
