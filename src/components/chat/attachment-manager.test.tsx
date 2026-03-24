import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { detectAttachmentType } from "@/lib/files/chat-attachment-types";

import { AttachmentManager } from "./attachment-manager";

describe("AttachmentManager", () => {
  it("renders attachment chips without any model capability warning copy", () => {
    const markup = renderToStaticMarkup(
      <AttachmentManager
        attachmentError=""
        attachments={[
          {
            fileType: detectAttachmentType("spec.pdf", "application/pdf"),
            id: "attachment-1",
            name: "spec.pdf",
          },
        ]}
        fileInputRef={{ current: null }}
        onFileInputChange={() => {}}
        onPreviewClose={() => {}}
        onPreviewOpen={() => {}}
        onRemoveAttachment={() => {}}
        previewAttachment={null}
      />,
    );

    expect(markup).toContain("spec.pdf");
    expect(markup).not.toContain("may not support");
  });

  it("still renders attachment errors", () => {
    const markup = renderToStaticMarkup(
      <AttachmentManager
        attachmentError="Unable to attach one or more selected files."
        attachments={[]}
        fileInputRef={{ current: null }}
        onFileInputChange={() => {}}
        onPreviewClose={() => {}}
        onPreviewOpen={() => {}}
        onRemoveAttachment={() => {}}
        previewAttachment={null}
      />,
    );

    expect(markup).toContain("Unable to attach one or more selected files.");
  });
});
