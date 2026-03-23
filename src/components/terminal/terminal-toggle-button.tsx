"use client";

import { ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Spinner } from "@heroui/react";
import { useState } from "react";
import { sileo } from "sileo";

import { getErrorMessage } from "@/lib/errors";

import { openOrCreateTerminalSession } from "./terminal-store";

type TerminalToggleButtonProps = {
  cwd: string | null;
};

export function TerminalToggleButton({ cwd }: TerminalToggleButtonProps) {
  const [isPending, setIsPending] = useState(false);

  const handlePress = async () => {
    if (!cwd) {
      return;
    }

    setIsPending(true);

    try {
      await openOrCreateTerminalSession(cwd, {
        toggleIfAlreadyActive: true,
      });
    } catch (error) {
      sileo.error({
        description: getErrorMessage(error, "Unable to open the terminal."),
        title: "Terminal failed",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      aria-label="Toggle embedded terminal"
      className="max-h-7"
      isDisabled={!cwd}
      onPress={() => {
        void handlePress();
      }}
      size="sm"
      variant="tertiary"
    >
      {isPending ? (
        <Spinner className="size-3.5 min-w-3.5" color="current" size="sm" />
      ) : (
        <HugeiconsIcon
          color="currentColor"
          icon={ComputerTerminal01Icon}
          size={16}
          strokeWidth={1.6}
        />
      )}
    </Button>
  );
}
