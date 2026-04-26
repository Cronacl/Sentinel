"use client";

import { Button } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useState } from "react";

import { writeTextToClipboard } from "@/lib/desktop/permissions";

export function CopyButton({
  text,
  title = "Copy",
}: {
  text: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const didCopy = await writeTextToClipboard(text, {
      errorMessage: "Unable to copy this text.",
    });
    if (!didCopy) {
      return;
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button
      size="sm"
      variant="ghost"
      isIconOnly
      aria-label={copied ? "Copied" : title}
      className="h-6 min-h-6 w-6 min-w-6"
      onClick={() => void handleCopy()}
      type="button"
    >
      <HugeiconsIcon
        color="currentColor"
        icon={copied ? Tick01Icon : Copy01Icon}
        height={10}
        width={10}
        strokeWidth={1.5}
      />
    </Button>
  );
}
