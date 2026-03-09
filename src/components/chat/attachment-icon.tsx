"use client";

import {
  AiImageIcon,
  Csv01Icon,
  DocumentAttachmentIcon,
  FileCodeIcon,
  FilePlayIcon,
  MusicNoteSquare01Icon,
  Note02Icon,
  Pdf01Icon,
  Ppt01Icon,
  Xls01Icon,
  Zip02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { AttachmentIconKey } from "@/lib/files/chat-attachment-types";

const ICONS = {
  audio: MusicNoteSquare01Icon,
  code: FileCodeIcon,
  csv: Csv01Icon,
  default: DocumentAttachmentIcon,
  doc: Note02Icon,
  image: AiImageIcon,
  md: Note02Icon,
  pdf: Pdf01Icon,
  ppt: Ppt01Icon,
  text: Note02Icon,
  video: FilePlayIcon,
  xls: Xls01Icon,
  zip: Zip02Icon,
} satisfies Record<AttachmentIconKey, unknown>;

export function AttachmentIcon({
  className,
  icon,
  size = 18,
  strokeWidth = 1.8,
}: {
  className?: string;
  icon: AttachmentIconKey;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <HugeiconsIcon
      className={className}
      color="currentColor"
      icon={ICONS[icon]}
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}
