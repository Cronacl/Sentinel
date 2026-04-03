"use client";

import {
  Checkbox,
  Description,
  ErrorMessage,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  Switch,
  TextArea,
  TextField,
} from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

type BaseFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  description?: ReactNode;
  label: ReactNode;
  name: TName;
};

export type SelectOption = {
  description?: ReactNode;
  isDisabled?: boolean;
  label: ReactNode;
  value: string;
};

type TextFieldRootProps = Omit<
  ComponentProps<typeof TextField.Root>,
  "children" | "defaultValue" | "name" | "onBlur" | "onChange" | "value"
>;
type InputRootProps = Omit<
  ComponentProps<typeof Input.Root>,
  "defaultValue" | "name" | "onBlur" | "onChange" | "value"
>;

type TextAreaRootProps = Omit<
  ComponentProps<typeof TextArea.Root>,
  "defaultValue" | "name" | "onBlur" | "onChange" | "value"
>;

type SelectRootProps = Omit<
  ComponentProps<typeof Select.Root>,
  | "children"
  | "defaultSelectedKey"
  | "name"
  | "onSelectionChange"
  | "selectedKey"
>;

type SwitchRootProps = Omit<
  ComponentProps<typeof Switch.Root>,
  "children" | "isSelected" | "name" | "onBlur" | "onChange"
>;

type CheckboxRootProps = Omit<
  ComponentProps<typeof Checkbox.Root>,
  "children" | "isSelected" | "name" | "onBlur" | "onChange"
>;

type NumberFieldRootProps = Omit<
  ComponentProps<typeof NumberField.Root>,
  "children" | "defaultValue" | "name" | "onBlur" | "onChange" | "value"
>;

type NumberFieldInputProps = Omit<
  ComponentProps<typeof NumberField.Input>,
  "defaultValue" | "name" | "onBlur" | "onChange" | "value"
>;

type FieldErrorProps = {
  error?: string;
};

function FieldError({ error }: FieldErrorProps) {
  if (!error) {
    return null;
  }

  return <ErrorMessage>{error}</ErrorMessage>;
}

export type ControlledTextFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = BaseFieldProps<TFieldValues, TName> & {
  inputProps?: InputRootProps;
  textFieldProps?: TextFieldRootProps;
};

export function ControlledTextField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  inputProps,
  label,
  name,
  textFieldProps,
}: ControlledTextFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField.Root
          {...textFieldProps}
          isInvalid={fieldState.invalid}
          name={field.name}
          onBlur={field.onBlur}
          onChange={field.onChange}
          value={String(field.value ?? "")}
        >
          <Label>{label}</Label>
          <Input.Root {...inputProps} />
          {description ? <Description>{description}</Description> : null}
          <FieldError error={fieldState.error?.message} />
        </TextField.Root>
      )}
    />
  );
}

export type ControlledTextAreaFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = BaseFieldProps<TFieldValues, TName> & {
  textAreaProps?: TextAreaRootProps;
  textFieldProps?: TextFieldRootProps;
};

export function ControlledTextAreaField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  label,
  name,
  textAreaProps,
  textFieldProps,
}: ControlledTextAreaFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField.Root
          {...textFieldProps}
          isInvalid={fieldState.invalid}
          name={field.name}
          onBlur={field.onBlur}
          onChange={field.onChange}
          value={String(field.value ?? "")}
        >
          <Label>{label}</Label>
          <TextArea.Root {...textAreaProps} />
          {description ? <Description>{description}</Description> : null}
          <FieldError error={fieldState.error?.message} />
        </TextField.Root>
      )}
    />
  );
}

export type ControlledSelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = BaseFieldProps<TFieldValues, TName> & {
  options: readonly SelectOption[];
  placeholder?: ReactNode;
  selectProps?: SelectRootProps;
};

export function ControlledSelectField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  label,
  name,
  options,
  placeholder,
  selectProps,
}: ControlledSelectFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const currentValue = field.value ? String(field.value) : null;
        const selectedOption =
          currentValue === null
            ? null
            : (options.find((option) => option.value === currentValue) ?? null);

        return (
          <Select.Root
            {...selectProps}
            isInvalid={fieldState.invalid}
            name={field.name}
            onSelectionChange={(key) =>
              field.onChange(key == null ? null : String(key))
            }
            selectedKey={selectedOption?.value ?? null}
          >
            <Label>{label}</Label>
            <Select.Trigger>
              <Select.Value>
                {() =>
                  selectedOption ? (
                    <div className="space-y-0.5">
                      <div>{selectedOption.label}</div>
                      {selectedOption.description ? (
                        <p className="text-muted text-xs">
                          {selectedOption.description}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted">{placeholder}</span>
                  )
                }
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
                      <div className="space-y-0.5">
                        <div>{option.label}</div>
                        {option.description ? (
                          <p className="text-muted text-xs">
                            {option.description}
                          </p>
                        ) : null}
                      </div>
                      <ListBox.ItemIndicator />
                    </div>
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
            {description ? <Description>{description}</Description> : null}
            <FieldError error={fieldState.error?.message} />
          </Select.Root>
        );
      }}
    />
  );
}

export type ControlledSwitchFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = BaseFieldProps<TFieldValues, TName> & {
  switchProps?: SwitchRootProps;
};

export function ControlledSwitchField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  label,
  name,
  switchProps,
}: ControlledSwitchFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-2">
          <Switch.Root
            {...switchProps}
            aria-label={typeof label === "string" ? label : undefined}
            isSelected={Boolean(field.value)}
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>
              <div className="space-y-1">
                <p className="text-sm font-medium">{label}</p>
                {description ? (
                  <p className="text-muted text-xs">{description}</p>
                ) : null}
              </div>
            </Switch.Content>
          </Switch.Root>

          {fieldState.error?.message ? (
            <p className="text-danger-soft-foreground text-xs">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

export type ControlledCheckboxFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = BaseFieldProps<TFieldValues, TName> & {
  checkboxProps?: CheckboxRootProps;
};

export function ControlledCheckboxField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  checkboxProps,
  control,
  description,
  label,
  name,
}: ControlledCheckboxFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-2">
          <Checkbox.Root
            {...checkboxProps}
            aria-label={typeof label === "string" ? label : undefined}
            isSelected={Boolean(field.value)}
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <div className="space-y-1">
                <p className="text-sm font-medium">{label}</p>
                {description ? (
                  <p className="text-muted text-xs">{description}</p>
                ) : null}
              </div>
            </Checkbox.Content>
          </Checkbox.Root>

          {fieldState.error?.message ? (
            <p className="text-danger-soft-foreground text-xs">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

export type ControlledNumberFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = BaseFieldProps<TFieldValues, TName> & {
  inputProps?: NumberFieldInputProps;
  numberFieldProps?: NumberFieldRootProps;
};

export function ControlledNumberField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  inputProps,
  label,
  name,
  numberFieldProps,
}: ControlledNumberFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <NumberField.Root
          {...numberFieldProps}
          isInvalid={fieldState.invalid}
          name={field.name}
          onBlur={field.onBlur}
          onChange={field.onChange}
          value={typeof field.value === "number" ? field.value : undefined}
        >
          <Label>{label}</Label>
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input {...inputProps} />
            <NumberField.IncrementButton />
          </NumberField.Group>
          {description ? <Description>{description}</Description> : null}
          <FieldError error={fieldState.error?.message} />
        </NumberField.Root>
      )}
    />
  );
}
