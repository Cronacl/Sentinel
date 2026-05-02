"use client";

import { useEffect, useState } from "react";
import { sileo } from "sileo";
import {
  Button,
  ButtonGroup,
  Dropdown,
  Label,
  Modal,
  Spinner,
  TextArea,
  useOverlayState,
} from "@heroui/react";
import {
  ArrowDown01Icon,
  Delete01Icon,
  PencilEdit02Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { runCommandInTerminal } from "@/components/terminal/terminal-store";
import { getErrorMessage } from "@/lib/errors";
import {
  clearWorkspaceRunCommand,
  getWorkspaceRunCommand,
  setWorkspaceRunCommand,
} from "@/lib/workspaces/run-command";

type WorkspaceRunCommandButtonProps = {
  cwd: string | null;
  workspaceId: string;
};

export function WorkspaceRunCommandButton({
  cwd,
  workspaceId,
}: WorkspaceRunCommandButtonProps) {
  const modalState = useOverlayState({});
  const [savedCommand, setSavedCommand] = useState<string | null>(null);
  const [draftCommand, setDraftCommand] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    setSavedCommand(getWorkspaceRunCommand(workspaceId));
    setDraftCommand("");
    setModalError("");
    modalState.close();
  }, [workspaceId]);

  const handleOpenEditor = () => {
    setDraftCommand(savedCommand ?? "");
    setModalError("");
    modalState.open();
  };

  const handleRun = async (commandToRun?: string) => {
    const resolvedCommand = (commandToRun ?? savedCommand ?? "").trim();
    if (!resolvedCommand) {
      handleOpenEditor();
      return;
    }

    setIsRunning(true);

    try {
      await runCommandInTerminal(cwd, resolvedCommand);
    } catch (error) {
      sileo.error({
        description: getErrorMessage(error, "Unable to run that command."),
        title: "Run command failed",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSaveAndRun = async () => {
    const nextCommand = draftCommand.trim();

    if (!nextCommand) {
      setModalError("Enter a command to run.");
      return;
    }

    setWorkspaceRunCommand(workspaceId, nextCommand);
    setSavedCommand(nextCommand);
    setModalError("");
    modalState.close();
    await handleRun(nextCommand);
  };

  const handleClear = () => {
    clearWorkspaceRunCommand(workspaceId);
    setSavedCommand(null);
    setDraftCommand("");
    setModalError("");
  };

  return (
    <>
      {savedCommand ? (
        <ButtonGroup size="sm" variant="tertiary">
          <Button
            aria-label="Run saved command"
            className="h-7 min-h-7 w-8 min-w-8 rounded-l-xl rounded-r-none"
            isDisabled={!cwd}
            isPending={isRunning}
            isIconOnly
            onPress={() => {
              void handleRun();
            }}
            size="sm"
            variant="tertiary"
          >
            {({ isPending }) =>
              isPending ? (
                <Spinner
                  className="size-3.5 min-w-3.5"
                  color="current"
                  size="sm"
                />
              ) : (
                <HugeiconsIcon
                  color="currentColor"
                  icon={PlayIcon}
                  size={16}
                  strokeWidth={1.7}
                />
              )
            }
          </Button>

          <Dropdown>
            <Button
              aria-label="Saved run command options"
              className="h-7 min-h-7 w-7 min-w-7 rounded-l-none rounded-r-xl"
              isDisabled={isRunning}
              isIconOnly
              size="sm"
              variant="tertiary"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={ArrowDown01Icon}
                size={14}
                strokeWidth={1.6}
              />
            </Button>

            <Dropdown.Popover className="min-w-[180px]" placement="bottom end">
              <Dropdown.Menu
                onAction={(key) => {
                  if (key === "edit") {
                    handleOpenEditor();
                  }
                  if (key === "clear") {
                    handleClear();
                  }
                }}
              >
                <Dropdown.Item id="edit" textValue="Edit run command">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={PencilEdit02Icon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>Edit run command</Label>
                </Dropdown.Item>
                <Dropdown.Item id="clear" textValue="Clear run command">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Delete01Icon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>Clear run command</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </ButtonGroup>
      ) : (
        <Button
          aria-label="Create run command"
          className="h-7 min-h-7 w-8 min-w-8 rounded-xl"
          isDisabled={!cwd}
          isIconOnly
          onPress={handleOpenEditor}
          size="sm"
          variant="tertiary"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={PlayIcon}
            size={16}
            strokeWidth={1.7}
          />
        </Button>
      )}

      <Modal.Root state={modalState}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog>
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-content1">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={PlayIcon}
                      size={18}
                      strokeWidth={1.7}
                    />
                  </div>
                  <Modal.CloseTrigger />
                </div>

                <h2 className="mt-3 text-base font-medium text-foreground">
                  Run
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Save a workspace command and run it with one click.
                </p>

                <div className="mt-4">
                  <p className="text-xs font-semibold text-muted">
                    Command to run
                  </p>
                  <TextArea.Root
                    className="mt-2 min-h-36"
                    name="command"
                    onChange={(event) => {
                      setDraftCommand(event.currentTarget.value);
                      if (modalError) {
                        setModalError("");
                      }
                    }}
                    fullWidth
                    placeholder={"eg:\nnpm install\nnpm run dev"}
                    value={draftCommand}
                    variant="secondary"
                  />
                  {modalError ? (
                    <p className="mt-2 text-xs text-danger">{modalError}</p>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button
                    onPress={() => modalState.close()}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    isDisabled={!draftCommand.trim() || !cwd}
                    isPending={isRunning}
                    onPress={() => {
                      void handleSaveAndRun();
                    }}
                    size="sm"
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : null}
                        Save and run
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  );
}
