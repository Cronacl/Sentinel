"use client";

import {
  Button,
  Form,
  Modal,
  Skeleton,
  Spinner,
  useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Delete02Icon,
  FingerPrintIcon,
  Mail01Icon,
  ShieldUserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { ControlledTextField } from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import type { PasskeyFormValues } from "@/schemas/security.schema";
import { passkeyFormSchema } from "@/schemas/security.schema";
import { authClient, useSession } from "@/server/better-auth/client";

function formatPasskeyDate(value: Date | string | null | undefined) {
  if (!value) {
    return "Recently added";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently added";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

function getPasskeyErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
}

function PasskeySkeletonList() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          className="border-separator bg-background flex items-center gap-4 rounded-xl border px-4 py-3"
          key={index}
        >
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-3 w-56 rounded-md" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

type AddPasskeyModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

function AddPasskeyModal({ isOpen, onOpenChange }: AddPasskeyModalProps) {
  const state = useOverlayState({ isOpen, onOpenChange });
  const [submitError, setSubmitError] = useState("");
  const form = useForm<PasskeyFormValues>({
    defaultValues: { name: "" },
    resolver: zodResolver(passkeyFormSchema),
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSubmitError("");
    form.reset({ name: "" });
  }, [form, isOpen]);

  const handleSubmit = async (values: PasskeyFormValues) => {
    setSubmitError("");

    try {
      const result = await authClient.passkey.addPasskey({
        name: values.name.trim(),
      });

      if (result.error) {
        setSubmitError(
          getPasskeyErrorMessage(result.error, "Unable to add this passkey."),
        );
        return;
      }

      form.reset({ name: "" });
      state.close();
    } catch (error) {
      setSubmitError(
        getPasskeyErrorMessage(error, "Unable to add this passkey."),
      );
    }
  };

  const isBusy = form.formState.isSubmitting;

  return (
    <Modal.Root state={state}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="md">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-2 text-base">
                <HugeiconsIcon
                  color="currentColor"
                  icon={FingerPrintIcon}
                  size={18}
                  strokeWidth={1.5}
                />
                Add Passkey
              </Modal.Heading>
              <p className="text-muted text-sm">
                Register a passkey for biometric or device-based sign-in.
              </p>
            </Modal.Header>

            <Modal.Body>
              {submitError ? (
                <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
                  {submitError}
                </p>
              ) : null}

              <Form
                className="flex flex-col gap-4"
                onSubmit={form.handleSubmit(handleSubmit)}
              >
                <ControlledTextField
                  control={form.control}
                  inputProps={{
                    placeholder: "MacBook Touch ID, YubiKey, etc.",
                  }}
                  label="Passkey name"
                  name="name"
                  textFieldProps={{ isRequired: true }}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    isDisabled={isBusy}
                    onPress={() => state.close()}
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button isPending={isBusy} type="submit">
                    {({ isPending }) => (
                      <>
                        {isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : null}
                        Add Passkey
                      </>
                    )}
                  </Button>
                </div>
              </Form>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

type DeletePasskeyModalProps = {
  isOpen: boolean;
  name: string;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
};

function DeletePasskeyModal({
  isOpen,
  name,
  onConfirm,
  onOpenChange,
}: DeletePasskeyModalProps) {
  const state = useOverlayState({ isOpen, onOpenChange });
  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSubmitError("");
      setIsPending(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setSubmitError("");
    setIsPending(true);

    try {
      await onConfirm();
      state.close();
    } catch (error) {
      setSubmitError(
        getPasskeyErrorMessage(error, "Unable to remove this passkey."),
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal.Root state={state}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-2 text-base">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Delete02Icon}
                  size={18}
                  strokeWidth={1.5}
                />
                Remove Passkey
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body>
              <p className="text-muted text-sm leading-6">
                Remove{" "}
                <span className="text-foreground font-medium">{name}</span> from
                your account? You can add it again later if needed.
              </p>
              {submitError ? (
                <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
                  {submitError}
                </p>
              ) : null}
            </Modal.Body>

            <Modal.Footer>
              <Button
                isDisabled={isPending}
                onPress={() => state.close()}
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                isPending={isPending}
                onPress={handleConfirm}
                variant="danger"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Remove
                  </>
                )}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

export default function SecurityPage() {
  const { data: sessionData, isPending: isSessionPending } = useSession();
  const {
    data: passkeys,
    error: passkeyError,
    isPending: isPasskeysPending,
  } = authClient.useListPasskeys();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [passkeyActionError, setPasskeyActionError] = useState("");
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);

  useEffect(() => {
    setIsPasskeySupported(
      typeof window !== "undefined" && "PublicKeyCredential" in window,
    );
  }, []);

  const sortedPasskeys = useMemo(
    () =>
      [...(passkeys ?? [])].sort((a, b) => {
        const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return right - left;
      }),
    [passkeys],
  );

  const handleDeletePasskey = async () => {
    if (!deleteTarget) {
      return;
    }

    const result = await authClient.passkey.deletePasskey({
      id: deleteTarget.id,
    });

    if (result.error) {
      throw new Error(
        getPasskeyErrorMessage(result.error, "Unable to remove this passkey."),
      );
    }

    setDeleteTarget(null);
    setPasskeyActionError("");
  };

  return (
    <SettingsPageWrapper
      subtitle="Review your sign-in email and manage passkeys for faster, more secure access."
      title="Security"
    >
      {passkeyError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {getPasskeyErrorMessage(
            passkeyError,
            "Unable to load your passkeys.",
          )}
        </p>
      ) : null}

      {passkeyActionError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {passkeyActionError}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <section className="border-separator bg-surface rounded-xl border p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="bg-background border-separator flex h-10 w-10 items-center justify-center rounded-xl border">
              <HugeiconsIcon
                color="currentColor"
                icon={Mail01Icon}
                size={18}
                strokeWidth={1.5}
              />
            </div>
            <div>
              <h2 className="text-foreground text-base font-medium">
                Sign-in Email
              </h2>
              <p className="text-muted mt-1 text-sm leading-6">
                This is the email address currently attached to your Sentinel
                account.
              </p>
            </div>
          </div>

          {isSessionPending ? (
            <Skeleton className="h-11 w-full rounded-xl" />
          ) : (
            <div className="border-separator bg-background rounded-xl border px-4 py-3">
              <p className="text-foreground text-sm font-medium">
                {sessionData?.user.email ?? "No email available"}
              </p>
            </div>
          )}
        </section>

        <section className="border-separator bg-surface rounded-xl border p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="bg-background border-separator flex h-10 w-10 items-center justify-center rounded-xl border">
                <HugeiconsIcon
                  color="currentColor"
                  icon={ShieldUserIcon}
                  size={18}
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <h2 className="text-foreground text-base font-medium">
                  Passkeys
                </h2>
                <p className="text-muted mt-1 text-sm leading-6">
                  Use your device biometrics or security key to sign in without
                  typing a password.
                </p>
              </div>
            </div>

            <Button
              isDisabled={!isPasskeySupported}
              onPress={() => {
                setPasskeyActionError("");
                setIsAddOpen(true);
              }}
              size="sm"
            >
              Add Passkey
            </Button>
          </div>

          {!isPasskeySupported ? (
            <p className="text-muted mb-4 text-xs">
              Passkeys are not available in this browser or device context.
            </p>
          ) : null}

          {isPasskeysPending ? <PasskeySkeletonList /> : null}

          {!isPasskeysPending && sortedPasskeys.length === 0 ? (
            <div className="border-separator bg-background flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border px-6 py-8 text-center">
              <div className="bg-surface border-separator flex h-12 w-12 items-center justify-center rounded-xl border">
                <HugeiconsIcon
                  color="currentColor"
                  icon={FingerPrintIcon}
                  size={22}
                  strokeWidth={1.5}
                />
              </div>
              <div className="space-y-1">
                <p className="text-foreground text-sm font-medium">
                  No passkeys yet
                </p>
                <p className="text-muted text-xs leading-5">
                  Add a passkey to sign in with Touch ID, Face ID, Windows
                  Hello, or a hardware security key.
                </p>
              </div>
            </div>
          ) : null}

          {!isPasskeysPending && sortedPasskeys.length > 0 ? (
            <div className="flex flex-col gap-3">
              {sortedPasskeys.map((passkey) => (
                <div
                  className="border-separator bg-background flex items-center gap-4 rounded-xl border px-4 py-3"
                  key={passkey.id}
                >
                  <div className="bg-surface border-separator flex h-10 w-10 items-center justify-center rounded-xl border">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={FingerPrintIcon}
                      size={18}
                      strokeWidth={1.5}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-sm font-medium">
                      {passkey.name?.trim() || "Unnamed passkey"}
                    </p>
                    <p className="text-muted truncate text-xs">
                      {passkey.credentialID}
                    </p>
                    <p className="text-muted mt-1 text-xs">
                      Added {formatPasskeyDate(passkey.createdAt)}
                      {passkey.deviceType
                        ? ` · ${passkey.deviceType.replace(/-/g, " ")}`
                        : ""}
                    </p>
                  </div>

                  <Button
                    onPress={() => {
                      setPasskeyActionError("");
                      setDeleteTarget({
                        id: passkey.id,
                        name: passkey.name?.trim() || "this passkey",
                      });
                    }}
                    size="sm"
                    variant="danger"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <AddPasskeyModal isOpen={isAddOpen} onOpenChange={setIsAddOpen} />

      <DeletePasskeyModal
        isOpen={!!deleteTarget}
        name={deleteTarget?.name ?? "this passkey"}
        onConfirm={handleDeletePasskey}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </SettingsPageWrapper>
  );
}
