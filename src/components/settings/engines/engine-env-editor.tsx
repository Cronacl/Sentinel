"use client";

import { Button, Chip, Input } from "@heroui/react";
import {
  Delete02Icon,
  PlusSignIcon,
  SquareLock02Icon,
  SquareUnlock02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  emptyEnvVarDraft,
  updateEnvVarDraft,
  type EnvVarDraft,
} from "./instance-management";

/**
 * An instance's environment variables. Secret values never come back from
 * the server: a stored secret shows as an empty field that keeps the stored
 * value until a new one is typed.
 */
export function EngineEnvEditor({
  drafts,
  isDisabled = false,
  onChange,
}: {
  drafts: EnvVarDraft[];
  isDisabled?: boolean;
  onChange: (next: EnvVarDraft[]) => void;
}) {
  const update = (
    key: string,
    patch: Parameters<typeof updateEnvVarDraft>[1],
  ) =>
    onChange(
      drafts.map((draft) =>
        draft.key === key ? updateEnvVarDraft(draft, patch) : draft,
      ),
    );

  return (
    <div className="flex flex-col gap-2">
      {drafts.map((draft, index) => {
        const label = draft.name.trim() || `variable ${index + 1}`;
        return (
          <div className="flex flex-col gap-1" key={draft.key}>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_auto] items-center gap-1.5">
              <Input
                aria-label={`Name of environment ${label}`}
                autoComplete="off"
                className="font-mono text-xs"
                disabled={isDisabled}
                onChange={(event) =>
                  update(draft.key, { name: event.target.value })
                }
                placeholder="VARIABLE_NAME"
                spellCheck={false}
                value={draft.name}
                variant="secondary"
              />
              <Input
                aria-label={`Value of environment ${label}`}
                autoComplete="off"
                className="font-mono text-xs"
                disabled={isDisabled}
                onChange={(event) =>
                  update(draft.key, { value: event.target.value })
                }
                placeholder={
                  draft.valueRedacted
                    ? "Stored secret: type to replace"
                    : "value"
                }
                spellCheck={false}
                type={draft.sensitive ? "password" : "text"}
                value={draft.value}
                variant="secondary"
              />
              <Button
                aria-label={
                  draft.sensitive
                    ? `Store ${label} as a plain value`
                    : `Store ${label} as a secret`
                }
                aria-pressed={draft.sensitive}
                isDisabled={isDisabled}
                isIconOnly
                onPress={() =>
                  update(draft.key, { sensitive: !draft.sensitive })
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={draft.sensitive ? SquareLock02Icon : SquareUnlock02Icon}
                  size={15}
                  strokeWidth={1.5}
                />
              </Button>
              <Button
                aria-label={`Remove ${label}`}
                isDisabled={isDisabled}
                isIconOnly
                onPress={() =>
                  onChange(drafts.filter((item) => item.key !== draft.key))
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
            {draft.needsReentry && draft.valueRedacted ? (
              <div className="flex items-center gap-1.5">
                <Chip color="warning" size="sm" variant="soft">
                  Re-enter
                </Chip>
                <span className="text-muted text-[11px]">
                  The stored value can no longer be decrypted, so it stays unset
                  until you enter it again.
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
      <Button
        className="w-full"
        isDisabled={isDisabled}
        onPress={() => onChange([...drafts, emptyEnvVarDraft()])}
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
        Add variable
      </Button>
      <p className="text-muted text-[11px]">
        Secret values are encrypted at rest and never shown again. Variables set
        here override the app&apos;s environment for this instance only.
      </p>
    </div>
  );
}
