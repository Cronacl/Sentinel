"use client";

import { Button, Form, Modal, Spinner, useOverlayState } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FolderAddIcon,
  FolderOpenIcon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ControlledTextField } from "@/components/forms/controlled-fields";
import { workspaceCreateSchema } from "@/schemas/workspace-thread.schema";

const workspaceCreateFormSchema = workspaceCreateSchema.pick({
  name: true,
});

type WorkspaceCreateFormValues = z.infer<typeof workspaceCreateFormSchema>;
type WorkspaceCreateValues = Pick<
  z.input<typeof workspaceCreateSchema>,
  "name" | "rootPath"
>;

type CreateWorkspaceModalProps = {
  isOpen: boolean;
  onCreate: (values: WorkspaceCreateValues) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
};

const defaultValues: WorkspaceCreateFormValues = {
  name: "",
};

type DirectoryHandleLike = {
  name: string;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<DirectoryHandleLike>;
};

export function CreateWorkspaceModal({
  isOpen,
  onCreate,
  onOpenChange,
}: CreateWorkspaceModalProps) {
  const state = useOverlayState({ isOpen, onOpenChange });
  const canPickDirectory =
    typeof window !== "undefined" &&
    "showDirectoryPicker" in (window as DirectoryPickerWindow);
  const [pickedDirectoryLabel, setPickedDirectoryLabel] = useState("");
  const [pickError, setPickError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const form = useForm<WorkspaceCreateFormValues>({
    defaultValues: { name: defaultValues.name },
    resolver: zodResolver(workspaceCreateFormSchema),
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSubmitError("");
    setPickError("");
    setPickedDirectoryLabel("");
    form.reset({ name: defaultValues.name });
  }, [form, isOpen]);

  const handlePickDirectory = async () => {
    setPickError("");

    const pickerWindow = window as DirectoryPickerWindow;
    if (!pickerWindow.showDirectoryPicker) {
      setPickError("Folder picking is not available in this runtime yet.");
      return;
    }

    try {
      const handle = await pickerWindow.showDirectoryPicker();
      setPickedDirectoryLabel(handle.name);

      if (!form.getValues("name").trim()) {
        form.setValue("name", handle.name, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setPickError("Unable to open the folder picker.");
    }
  };

  const handleSubmit = async (values: WorkspaceCreateFormValues) => {
    setSubmitError("");

    try {
      await onCreate({
        ...values,
        rootPath: undefined,
      });
      form.reset({ name: defaultValues.name });
      setPickedDirectoryLabel("");
      state.close();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to create that workspace.",
      );
    }
  };

  const isBusy = form.formState.isSubmitting;

  return (
    <Modal.Root state={state}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className="border-separator w-full border sm:max-w-[460px]">
            <Modal.Header className="items-start justify-between gap-4">
              <div>
                <Modal.Heading className="flex items-center gap-2 text-base">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={FolderAddIcon}
                    size={18}
                    strokeWidth={1.5}
                  />
                  Create Workspace
                </Modal.Heading>
                <p className="text-muted mt-1 text-sm">
                  Create a workspace for grouped threads. Local folder linking
                  needs a native desktop bridge, so it is not stored yet here.
                </p>
              </div>
              <Modal.CloseTrigger />
            </Modal.Header>

            <Modal.Body className="p-2">
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
                  inputProps={{ placeholder: "Sentinel" }}
                  label="Workspace name"
                  name="name"
                  textFieldProps={{ isRequired: true }}
                />

                <div className="border-separator bg-background rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-foreground text-sm font-medium">
                        Folder selection
                      </p>
                      <p className="text-muted mt-1 text-xs leading-5">
                        You can pick a folder for naming convenience, but this
                        web runtime cannot read the absolute filesystem path.
                      </p>
                    </div>

                    <Button
                      isDisabled={!canPickDirectory}
                      onPress={() => void handlePickDirectory()}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={FolderOpenIcon}
                        size={16}
                        strokeWidth={1.5}
                      />
                      Choose Folder
                    </Button>
                  </div>

                  <div className="bg-default mt-4 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <HugeiconsIcon
                        color="currentColor"
                        icon={LinkSquare02Icon}
                        size={16}
                        strokeWidth={1.5}
                      />
                      <span className="truncate">
                        {pickedDirectoryLabel || "No folder selected"}
                      </span>
                    </div>
                  </div>

                  {!canPickDirectory ? (
                    <p className="text-muted mt-3 text-xs leading-5">
                      This browser runtime cannot expose absolute local folder
                      paths. A desktop bridge is required for that.
                    </p>
                  ) : null}

                  {pickError ? (
                    <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mt-3 rounded-xl border px-3 py-2.5 text-xs">
                      {pickError}
                    </p>
                  ) : null}
                </div>

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
                        Create
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
