"use client";

import type { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { ReactRenderer, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { ChatEngine } from "@/server/db/enums";
import type { WorkspaceFileResult } from "@/lib/workspace/file-search";

import { PathMention, PathMentionPluginKey } from "./extensions/path-mention";
import {
  SkillMention,
  SkillMentionPluginKey,
} from "./extensions/skill-mention";
import {
  SuggestionList,
  type SuggestionItem,
  type SuggestionListRef,
} from "./extensions/suggestion-list";

type SkillListItem = {
  description: string;
  directory: string;
  name: string;
  scope: string;
  sourceKind: string;
  target: string;
};

function filterSkillsForEngine(
  skills: SkillListItem[],
  engine: ChatEngine,
): SkillListItem[] {
  switch (engine) {
    case "sentinel":
      return skills.filter((s) => s.target === "sentinel");
    case "codex":
      return skills.filter((s) => s.target === "codex");
    case "claude":
      return skills.filter(
        (s) =>
          s.target === "claude" ||
          (s.target === "sentinel" && s.sourceKind === "agents"),
      );
    default:
      return skills;
  }
}

function createSuggestionRenderer() {
  return () => {
    let renderer: ReactRenderer<SuggestionListRef> | null = null;

    return {
      onStart: (props: {
        clientRect?: (() => DOMRect | null) | null;
        command: (item: SuggestionItem) => void;
        editor: Editor;
        items: SuggestionItem[];
      }) => {
        renderer = new ReactRenderer(SuggestionList, {
          editor: props.editor,
          props: {
            clientRect: props.clientRect,
            command: props.command,
            items: props.items,
          },
        });
      },
      onUpdate: (props: {
        clientRect?: (() => DOMRect | null) | null;
        command: (item: SuggestionItem) => void;
        items: SuggestionItem[];
      }) => {
        renderer?.updateProps({
          clientRect: props.clientRect,
          command: props.command,
          items: props.items,
        });
      },
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "Escape") {
          renderer?.destroy();
          renderer = null;
          return true;
        }
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit: () => {
        renderer?.destroy();
        renderer = null;
      },
    };
  };
}

export function useComposerEditor({
  activeWorkspaceId,
  isBusy,
  isLocked,
  isThread,
  onAddBrowserFiles,
  onFetchPathSuggestions,
  onFetchSkillSuggestions,
  onSendRef,
  promptSeed,
  promptSeedKey,
  selectedEngine,
}: {
  activeWorkspaceId: string | null;
  isBusy: boolean;
  isLocked: boolean;
  isThread: boolean;
  onAddBrowserFiles: (files: File[]) => void;
  onFetchPathSuggestions: (query: string) => Promise<WorkspaceFileResult[]>;
  onFetchSkillSuggestions: () => SkillListItem[];
  onSendRef: React.RefObject<() => void>;
  promptSeed?: string;
  promptSeedKey?: string | number;
  selectedEngine: ChatEngine;
}) {
  const placeholderText = isThread ? "Ask follow-up changes" : "Ask anything";
  const addBrowserFilesRef = useRef(onAddBrowserFiles);
  addBrowserFilesRef.current = onAddBrowserFiles;

  const fetchPathSuggestionsRef = useRef(onFetchPathSuggestions);
  fetchPathSuggestionsRef.current = onFetchPathSuggestions;

  const fetchSkillSuggestionsRef = useRef(onFetchSkillSuggestions);
  fetchSkillSuggestionsRef.current = onFetchSkillSuggestions;

  const selectedEngineRef = useRef(selectedEngine);
  selectedEngineRef.current = selectedEngine;

  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;

  const pathSuggestionRender = useMemo(() => createSuggestionRenderer(), []);
  const skillSuggestionRender = useMemo(() => createSuggestionRenderer(), []);

  const pathItems = useCallback(
    async ({ query }: { query: string }): Promise<SuggestionItem[]> => {
      if (!activeWorkspaceIdRef.current) return [];

      try {
        const results = await fetchPathSuggestionsRef.current(query);
        return results.map((result) => ({
          absolutePath: result.absolutePath,
          icon: result.kind as "file" | "directory",
          id: result.absolutePath,
          kind: result.kind,
          label: result.label,
          relativePath: result.relativePath,
          sublabel: result.relativePath,
        }));
      } catch {
        return [];
      }
    },
    [],
  );

  const skillItems = useCallback(
    ({ query }: { query: string }): SuggestionItem[] => {
      const allSkills = fetchSkillSuggestionsRef.current();
      const filtered = filterSkillsForEngine(
        allSkills,
        selectedEngineRef.current,
      );

      const normalizedQuery = query.toLowerCase().trim();

      return filtered
        .filter(
          (s) =>
            !normalizedQuery ||
            s.name.toLowerCase().includes(normalizedQuery) ||
            s.description.toLowerCase().includes(normalizedQuery),
        )
        .slice(0, 15)
        .map((skill) => ({
          description: skill.description,
          directory: skill.directory,
          engine: selectedEngineRef.current,
          icon: "skill" as const,
          id: `${skill.target}:${skill.name}`,
          label: skill.name,
          scope: skill.scope,
          sourceKind: skill.sourceKind,
          sublabel: skill.description,
          target: skill.target,
        }));
    },
    [],
  );

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
          // Check if suggestion plugins are active -- if so, let them handle Enter
          const pathState = PathMentionPluginKey.getState(_view.state);
          const skillState = SkillMentionPluginKey.getState(_view.state);
          if (pathState?.active || skillState?.active) {
            return false;
          }

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
      PathMention.configure({
        suggestion: {
          items: pathItems,
          render: pathSuggestionRender,
        },
      }),
      SkillMention.configure({
        suggestion: {
          items: skillItems,
          render: skillSuggestionRender,
        },
      }),
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
