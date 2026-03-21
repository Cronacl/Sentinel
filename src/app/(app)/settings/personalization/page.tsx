"use client";

import { Button, Form, Skeleton, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
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
    <div className="flex flex-col gap-6">
      <div className="border-separator bg-surface rounded-xl border p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28 rounded-md" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>
        </div>
      </div>

      <div className="border-separator bg-surface rounded-xl border p-5">
        <div className="space-y-5">
          {Array.from({ length: 2 }).map((_, index) => (
            <div className="space-y-2" key={index}>
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
          <div className="space-y-2">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        </div>
      </div>

      <div className="border-separator bg-surface rounded-xl border p-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-36 rounded-md" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>

      <div className="flex justify-end">
        <Skeleton className="h-10 w-20 rounded-xl" />
      </div>
    </div>
  );
}

export default function PersonalizationPage() {
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");

  const form = useForm<PersonalizationFormValues>({
    defaultValues: {
      aboutUser: "",
      customInstructions: "",
      nickname: "",
      occupation: "",
      personality: DEFAULT_PERSONALITY_PRESET,
    },
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
        <Form
          className="flex flex-col gap-6"
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          <section className="border-separator bg-surface rounded-xl border p-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] md:items-start">
              <div className="space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Personality
                </h2>
                <p className="text-muted text-sm">
                  Choose the default tone Sentinel should use when responding.
                </p>
              </div>

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
          </section>

          <section className="border-separator bg-surface rounded-xl border p-5">
            <div className="mb-5">
              <h2 className="text-foreground text-base font-medium">
                About You
              </h2>
              <p className="text-muted mt-1 text-sm">
                Give Sentinel a bit more context to personalize answers and
                examples.
              </p>
            </div>

            <div className="flex flex-col gap-5">
              <ControlledTextField
                control={form.control}
                inputProps={{ placeholder: "Name" }}
                label="Your nickname"
                name="nickname"
              />

              <ControlledTextField
                control={form.control}
                inputProps={{ placeholder: "Engineer, student, etc." }}
                label="Your occupation"
                name="occupation"
              />

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
            </div>
          </section>

          <section className="border-separator bg-surface rounded-xl border p-5">
            <div className="mb-5">
              <h2 className="text-foreground text-base font-medium">
                Custom Instructions
              </h2>
              <p className="text-muted mt-1 text-sm">
                Add persistent instructions that Sentinel should follow across
                conversations.
              </p>
            </div>

            <ControlledTextAreaField
              control={form.control}
              label="Instructions"
              name="customInstructions"
              textAreaProps={{
                className: "min-h-56 font-mono text-sm",
                placeholder: "Add your custom instructions...",
              }}
            />
          </section>

          <div className="flex justify-end">
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
        </Form>
      )}
    </SettingsPageWrapper>
  );
}
