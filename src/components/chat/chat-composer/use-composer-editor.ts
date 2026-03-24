import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";

export function useComposerEditor({
  isBusy,
  isLocked,
  isThread,
  onAddBrowserFiles,
  onSendRef,
  promptSeed,
  promptSeedKey,
}: {
  isBusy: boolean;
  isLocked: boolean;
  isThread: boolean;
  onAddBrowserFiles: (files: File[]) => void;
  onSendRef: React.RefObject<() => void>;
  promptSeed?: string;
  promptSeedKey?: string | number;
}) {
  const placeholderText = isThread ? "Ask follow-up changes" : "Ask anything";
  const addBrowserFilesRef = useRef(onAddBrowserFiles);
  addBrowserFilesRef.current = onAddBrowserFiles;

  const editor = useEditor({
    content: {
      content: [{ type: "paragraph" }],
      type: "doc",
    },
    editorProps: {
      attributes: {
        class:
          "sentinel-composer-editor outline-none text-[14px] text-foreground",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSendRef.current();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const files: File[] = [];
        for (const item of items) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
        if (files.length > 0) {
          addBrowserFilesRef.current(files);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        addBrowserFilesRef.current(Array.from(files));
        return true;
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder: placeholderText }),
    ],
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isLocked);
    const placeholderExt = editor.extensionManager.extensions.find(
      (ext) => ext.name === "placeholder",
    );
    if (placeholderExt) {
      placeholderExt.options.placeholder = isBusy
        ? "Generating..."
        : placeholderText;
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, isLocked, isBusy, placeholderText]);

  useEffect(() => {
    if (!editor || promptSeedKey === undefined) return;
    if (!promptSeed?.trim()) {
      editor.commands.setContent({
        content: [{ type: "paragraph" }],
        type: "doc",
      });
      return;
    }
    editor.commands.setContent({
      content: [
        {
          content: [{ text: promptSeed, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    editor.commands.focus("end");
  }, [editor, promptSeed, promptSeedKey]);

  return { editor, placeholderText };
}
