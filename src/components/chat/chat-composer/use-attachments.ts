import { useCallback, useEffect, useRef, useState } from "react";
import type { FileUIPart } from "ai";

import {
  createBrowserAttachments,
  createComposerAttachmentFromFilePart,
  convertComposerAttachmentsToFileParts,
  type ComposerAttachment,
} from "../chat-attachments";

export function useAttachments({
  attachmentSeed = [],
  promptSeedKey,
}: {
  attachmentSeed?: FileUIPart[];
  promptSeedKey?: string | number;
}) {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [previewAttachment, setPreviewAttachment] =
    useState<ComposerAttachment | null>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) {
        if (a.previewUrl?.startsWith("blob:"))
          URL.revokeObjectURL(a.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (promptSeedKey === undefined) return;
    setAttachments(attachmentSeed.map(createComposerAttachmentFromFilePart));
  }, [attachmentSeed, promptSeedKey]);

  const addBrowserFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const { accepted, rejected } = createBrowserAttachments(files);

    if (rejected.length > 0) {
      setAttachmentError(
        "Some files are not supported yet. Use images, text/code files, PDF, office documents, spreadsheets, or presentations.",
      );
    } else {
      setAttachmentError("");
    }

    if (accepted.length === 0) return;
    setAttachments((current) => [...current, ...accepted]);
  }, []);

  useEffect(() => {
    const handleBrowserScreenshot = (event: Event) => {
      const file = (event as CustomEvent<File>).detail;
      if (file instanceof File) {
        addBrowserFiles([file]);
      }
    };

    window.addEventListener(
      "sentinel:browser-screenshot",
      handleBrowserScreenshot,
    );
    return () =>
      window.removeEventListener(
        "sentinel:browser-screenshot",
        handleBrowserScreenshot,
      );
  }, [addBrowserFiles]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const removed = current.find((a) => a.id === id);
      if (removed?.previewUrl?.startsWith("blob:"))
        URL.revokeObjectURL(removed.previewUrl);
      return current.filter((a) => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      return [];
    });
  }, []);

  const handlePickFiles = () => {
    setAttachmentError("");
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    addBrowserFiles(Array.from(fileList));
    e.target.value = "";
  };

  return {
    addBrowserFiles,
    attachmentError,
    attachments,
    clearAttachments,
    convertToFileParts: () =>
      convertComposerAttachmentsToFileParts(attachments),
    fileInputRef,
    handleFileInputChange,
    handlePickFiles,
    previewAttachment,
    removeAttachment,
    setAttachmentError,
    setPreviewAttachment,
  };
}
