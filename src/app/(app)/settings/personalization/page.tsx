"use client";

import { Button, Form, Skeleton, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import {
  ControlledSelectField,
  ControlledTextAreaField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import {
  DEFAULT_PERSONALITY_PRESET,
  PERSONALITY_PRESETS,
} from "@/lib/personalization";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import {
  type PersonalizationFormValues,
  personalizationFormSchema,
} from "@/schemas/personalization.schema";
import { api } from "@/trpc/react";

function PersonalizationSkeleton() {
  return (
    <section className="border-separator/20 bg-surface rounded-2xl border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          className={`flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between${i > 0 ? " border-t border-border/50" : ""}`}
          key={i}
        >
          <div className="space-y-2">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>
          <div className="w-full lg:w-[360px]">
            <Skeleton className="h-10 w-full rounded-xl" />
            {i >= 2 ? (
              <Skeleton className="mt-3 h-28 w-full rounded-xl" />
            ) : null}
          </div>
        </div>
      ))}
      <div className="flex justify-end border-t border-border/50 p-5">
        <Skeleton className="h-10 w-20 rounded-xl" />
      </div>
    </section>
  );
}

function SettingsSectionRow({
  children,
  description,
  isFirst = false,
  title,
}: {
  children: ReactNode;
  description: ReactNode;
  isFirst?: boolean;
  title: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between${isFirst ? "" : " border-t border-border/50"}`}
    >
      <div className="space-y-1">
        <h2 className="text-foreground text-base font-medium">{title}</h2>
        <p className="text-muted text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SettingsRowControl({
  children,
  widthClassName = "lg:w-[360px]",
}: {
  children: ReactNode;
  widthClassName?: string;
}) {
  return (
    <div
      className={`flex w-full max-w-full flex-col gap-3 ${widthClassName} lg:items-end`}
    >
      {children}
    </div>
  );
}

function ResetAction({
  label = "Reset",
  onPress,
}: {
  label?: string;
  onPress: () => void;
}) {
  return (
    <Button onPress={onPress} size="sm" variant="ghost">
      {label}
    </Button>
  );
}

const DEFAULT_PERSONALIZATION_VALUES: PersonalizationFormValues = {
  aboutUser: "",
  customInstructions: "",
  nickname: "",
  occupation: "",
  personality: DEFAULT_PERSONALITY_PRESET,
};

function isDefaultValue(value: string | null | undefined) {
  return !value?.trim();
}

function getPersonalityDescription(
  value: PersonalizationFormValues["personality"],
) {
  return (
    PERSONALITY_PRESETS.find((preset) => preset.value === value)?.description ??
    ""
  );
}

export default function PersonalizationPage() {
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");

  const form = useForm<PersonalizationFormValues>({
    defaultValues: DEFAULT_PERSONALIZATION_VALUES,
    resolver: zodResolver(personalizationFormSchema),
  });

  const {
    data: personalization,
    error,
    isPending,
  } = api.personalization.get.useQuery();

  useEffect(() => {
    if (!personalization) return;

    form.reset({
      aboutUser: personalization.aboutUser,
      customInstructions: personalization.customInstructions,
      nickname: personalization.nickname,
      occupation: personalization.occupation,
      personality: personalization.personality,
    });
  }, [form, personalization]);

  const savePersonalization = api.personalization.upsert.useMutation(
    useOptimisticMutation({
      applyOptimisticUpdate: (_current, values: PersonalizationFormValues) =>
        values,
      getData: () => utils.personalization.get.getData(),
      onError: (mutationError) => {
        setSubmitError(mutationError.message);
      },
      onSuccess: (data) => {
        setSubmitError("");
        utils.personalization.get.setData(undefined, data);
        form.reset(data);
        sileo.success({ description: "Personalization saved." });
      },
      setData: (value) => {
        utils.personalization.get.setData(undefined, value);
      },
    }),
  );

  const handleSubmit = async (values: PersonalizationFormValues) => {
    setSubmitError("");
    try {
      await savePersonalization.mutateAsync(values);
    } catch {
      // Mutation errors are surfaced via the mutation state.
    }
  };

  const resetField = <TField extends keyof PersonalizationFormValues>(
    field: TField,
    value: PersonalizationFormValues[TField],
  ) => {
    form.setValue(field, value as never, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const selectedPersonality = form.watch("personality");
  const nickname = form.watch("nickname");
  const occupation = form.watch("occupation");
  const aboutUser = form.watch("aboutUser");
  const customInstructions = form.watch("customInstructions");

  return (
    <SettingsPageWrapper
      subtitle="Set a default personality and give Sentinel more context about you."
      title="Personalization"
    >
      {error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {error.message}
        </p>
      ) : null}

      {submitError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {submitError}
        </p>
      ) : null}

      {!personalization && isPending ? (
        <PersonalizationSkeleton />
      ) : (
        <Form onSubmit={form.handleSubmit(handleSubmit)}>
          <section className="border-separator/20 bg-surface rounded-2xl border">
            <SettingsSectionRow
              description="Choose the default tone Sentinel should use when responding."
              isFirst
              title="Personality"
            >
              <SettingsRowControl>
                <div className="w-full lg:max-w-[360px]">
                  <ControlledSelectField
                    control={form.control}
                    label="Personality"
                    name="personality"
                    options={PERSONALITY_PRESETS.map((preset) => ({
                      description: preset.description,
                      label: preset.label,
                      value: preset.value,
                    }))}
                    selectProps={{ className: "w-full" }}
                  />
                </div>
              </SettingsRowControl>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="Add a name Sentinel can use when it personalizes responses."
              title="Nickname"
            >
              <SettingsRowControl>
                <ControlledTextField
                  control={form.control}
                  inputProps={{ placeholder: "Name" }}
                  label="Your nickname"
                  name="nickname"
                  textFieldProps={{ className: "w-full" }}
                />
                {!isDefaultValue(nickname) ? (
                  <div className="flex justify-end">
                    <ResetAction onPress={() => resetField("nickname", "")} />
                  </div>
                ) : null}
              </SettingsRowControl>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="Share your role or area of work so examples feel more relevant."
              title="Occupation"
            >
              <SettingsRowControl>
                <ControlledTextField
                  control={form.control}
                  inputProps={{ placeholder: "Engineer, student, etc." }}
                  label="Your occupation"
                  name="occupation"
                  textFieldProps={{ className: "w-full" }}
                />
                {!isDefaultValue(occupation) ? (
                  <div className="flex justify-end">
                    <ResetAction onPress={() => resetField("occupation", "")} />
                  </div>
                ) : null}
              </SettingsRowControl>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="Give Sentinel context about your interests, values, or preferences."
              title="About you"
            >
              <SettingsRowControl widthClassName="lg:w-[420px]">
                <ControlledTextAreaField
                  control={form.control}
                  label="More about you"
                  name="aboutUser"
                  textAreaProps={{
                    className: "min-h-28",
                    placeholder:
                      "Interests, values, or preferences to keep in mind",
                  }}
                />
                {!isDefaultValue(aboutUser) ? (
                  <div className="flex justify-end">
                    <ResetAction onPress={() => resetField("aboutUser", "")} />
                  </div>
                ) : null}
              </SettingsRowControl>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="Add persistent instructions Sentinel should follow across conversations."
              title="Custom instructions"
            >
              <SettingsRowControl widthClassName="lg:w-[420px]">
                <ControlledTextAreaField
                  control={form.control}
                  label="Instructions"
                  name="customInstructions"
                  textAreaProps={{
                    className: "min-h-56 font-mono text-sm",
                    placeholder: "Add your custom instructions...",
                  }}
                />
                {!isDefaultValue(customInstructions) ? (
                  <div className="flex justify-end">
                    <ResetAction
                      onPress={() => resetField("customInstructions", "")}
                    />
                  </div>
                ) : null}
              </SettingsRowControl>
            </SettingsSectionRow>

            <div className="flex justify-end border-t border-border/50 p-5">
              <Button
                isDisabled={
                  savePersonalization.isPending || !form.formState.isDirty
                }
                isPending={savePersonalization.isPending}
                size="sm"
                type="submit"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Save
                  </>
                )}
              </Button>
            </div>
          </section>
        </Form>
      )}
    </SettingsPageWrapper>
  );
}
