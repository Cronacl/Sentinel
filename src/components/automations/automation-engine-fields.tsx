"use client";

import { Description, Label, ListBox, Select } from "@heroui/react";

import type { ChatComposerEngineOption } from "@/components/chat/chat-composer-helpers";
import type { SelectOption } from "@/components/forms/controlled-fields";
import type { EngineSelectOptionDescriptor } from "@/lib/ai/chat/engines/contract";

import {
  AUTOMATION_ENGINE_UNAVAILABLE_MESSAGE,
  AUTOMATION_OPTION_DEFAULT,
  getAutomationDriverOptions,
  getAutomationInstanceOptions,
  getAutomationModelOptionChoices,
  pickAutomationInstanceForDriver,
  shouldShowAutomationInstancePicker,
} from "./automation-form-helpers";

type PickerOption = SelectOption & { accentColor?: string | null };

function AccentDot({ color }: { color: string | null | undefined }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full bg-muted"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

/** A select over plain values, shaped like ControlledSelectField. */
function PickerSelect({
  description,
  isDisabled,
  label,
  onChange,
  options,
  showAccents = false,
  value,
}: {
  description?: string;
  isDisabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: readonly PickerOption[];
  showAccents?: boolean;
  value: string | null;
}) {
  const selected = options.find((option) => option.value === value) ?? null;
  const renderOption = (option: PickerOption) => (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        {showAccents ? <AccentDot color={option.accentColor} /> : null}
        <span>{option.label}</span>
      </div>
      {option.description ? (
        <p className="text-muted text-xs">{option.description}</p>
      ) : null}
    </div>
  );

  return (
    <Select.Root
      isDisabled={isDisabled}
      onSelectionChange={(key) => {
        if (key != null) {
          onChange(String(key));
        }
      }}
      selectedKey={selected?.value ?? null}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value>
          {() => (selected ? renderOption(selected) : null)}
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              id={option.value}
              isDisabled={option.isDisabled}
              key={option.value}
              textValue={String(option.label)}
            >
              <div className="flex items-center justify-between gap-3">
                {renderOption(option)}
                <ListBox.ItemIndicator />
              </div>
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
      {description ? <Description>{description}</Description> : null}
    </Select.Root>
  );
}

/**
 * The automation's engine as a driver picker, plus an instance picker when
 * the driver has several instances (or the automation uses a non-default
 * one). Both write the instance id.
 */
export function AutomationEngineFields({
  catalogOptions,
  driver,
  instanceId,
  notice,
  onInstanceChange,
}: {
  catalogOptions: readonly ChatComposerEngineOption[];
  /** The driver of `instanceId` (resolveAutomationEngine); null if unknown. */
  driver: string | null;
  instanceId: string;
  notice?: string | null;
  onInstanceChange: (instanceId: string) => void;
}) {
  const driverOptions = getAutomationDriverOptions(catalogOptions, driver);
  const showInstances = shouldShowAutomationInstancePicker(
    catalogOptions,
    driver,
    instanceId,
  );
  const instanceListed = catalogOptions.some(
    (option) => option.instanceId === instanceId,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <PickerSelect
          description="Choose which engine and runtime this automation should use."
          label="Engine"
          onChange={(nextDriver) =>
            onInstanceChange(
              pickAutomationInstanceForDriver(
                catalogOptions,
                nextDriver,
                instanceId,
              ),
            )
          }
          options={driverOptions}
          value={driver}
        />
        {!driver || (catalogOptions.length > 0 && !instanceListed) ? (
          <p className="text-warning text-xs">
            {AUTOMATION_ENGINE_UNAVAILABLE_MESSAGE}
          </p>
        ) : notice ? (
          <p className="text-muted text-xs">{notice}</p>
        ) : null}
      </div>
      {showInstances ? (
        <PickerSelect
          description="The instance runs with its own home, environment and models."
          label="Instance"
          onChange={onInstanceChange}
          options={getAutomationInstanceOptions(
            catalogOptions,
            driver,
            instanceId,
          )}
          showAccents
          value={instanceId}
        />
      ) : null}
    </div>
  );
}

/**
 * One picker per model option (OpenCode's agent and variant, …), each led
 * by "Model default". Values left at the default are not stored.
 */
export function AutomationModelOptionFields({
  descriptors,
  onChange,
  values,
}: {
  descriptors: readonly EngineSelectOptionDescriptor[];
  onChange: (values: Record<string, string>) => void;
  values: Readonly<Record<string, string>>;
}) {
  if (descriptors.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {descriptors.map((descriptor) => (
        <PickerSelect
          description={
            descriptor.description ?? "Applied when this automation runs."
          }
          key={descriptor.id}
          label={descriptor.label}
          onChange={(value) => {
            const next = { ...values };
            if (value === AUTOMATION_OPTION_DEFAULT) {
              delete next[descriptor.id];
            } else {
              next[descriptor.id] = value;
            }
            onChange(next);
          }}
          options={getAutomationModelOptionChoices(
            descriptor,
            values[descriptor.id],
          )}
          value={values[descriptor.id] ?? AUTOMATION_OPTION_DEFAULT}
        />
      ))}
    </div>
  );
}
