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
  installOrigin?: "external" | "sentinel";
  isExternal?: boolean;
  name: string;
  scope: string;
  sourceKind: string;
  target: string;
};

function getSkillMatchScore(skill: SkillListItem, normalizedQuery: string) {
  if (!normalizedQuery) {
    return 0;
  }

  const name = skill.name.toLowerCase();
  const description = skill.description.toLowerCase();

  if (name.startsWith(normalizedQuery)) {
    return 0;
  }

  if (name.includes(normalizedQuery)) {
    return 1;
  }

  if (description.startsWith(normalizedQuery)) {
    return 2;
  }

  if (description.includes(normalizedQuery)) {
    return 3;
  }

  return null;
}

function getSkillEngineSourceRank(skill: SkillListItem, engine: ChatEngine) {
  switch (engine) {
    case "claude":
      return skill.sourceKind === "claude" ? 0 : 1;
    case "copilot":
      return skill.target === "copilot" ? 0 : 1;
    case "sentinel":
      return skill.sourceKind === "sentinel" ? 0 : 1;
    case "codex":
      return 0;
    default:
      return 99;
  }
}

function getSkillInstallOriginRank(skill: SkillListItem) {
  return skill.installOrigin === "sentinel" ? 0 : 1;
}

export function getSkillSuggestionTitle(engine: ChatEngine) {
  switch (engine) {
    case "claude":
      return "Showing Claude skills";
    case "copilot":
      return "Showing Copilot skills";
    case "codex":
      return "Showing Codex skills";
    case "sentinel":
      return "Showing Sentinel skills";
    default:
      return "Showing skills";
  }
}

export function filterSkillsForEngine(
  skills: SkillListItem[],
  engine: ChatEngine,
): SkillListItem[] {
  const filtered = (() => {
    switch (engine) {
      case "sentinel":
        return skills.filter((s) => s.target === "sentinel");
      case "copilot":
        return skills.filter((s) => s.target === "copilot");
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
  })();

  const winners = new Map<string, SkillListItem>();

  for (const skill of filtered) {
    const key = skill.name.trim().toLowerCase();
    const existing = winners.get(key);

    if (!existing) {
      winners.set(key, skill);
      continue;
    }

    const skillSourceRank = getSkillEngineSourceRank(skill, engine);
    const existingSourceRank = getSkillEngineSourceRank(existing, engine);
    const skillInstallRank = getSkillInstallOriginRank(skill);
    const existingInstallRank = getSkillInstallOriginRank(existing);

    if (
      skillSourceRank < existingSourceRank ||
      (skillSourceRank === existingSourceRank &&
        skillInstallRank < existingInstallRank)
    ) {
      winners.set(key, skill);
    }
  }

  return Array.from(winners.values());
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
            variant: "path",
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
          variant: "path",
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

function createSkillSuggestionRenderer(selectedEngineRef: {
  current: ChatEngine;
}) {
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
            title: getSkillSuggestionTitle(selectedEngineRef.current),
            variant: "skill",
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
          title: getSkillSuggestionTitle(selectedEngineRef.current),
          variant: "skill",
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
  const skillSuggestionRender = useMemo(
    () => createSkillSuggestionRenderer(selectedEngineRef),
    [],
  );

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
        .map((skill) => ({
          score: getSkillMatchScore(skill, normalizedQuery),
          skill,
        }))
        .filter(
          (entry): entry is { score: number; skill: SkillListItem } =>
            entry.score != null,
        )
        .sort((left, right) => {
          if (left.score !== right.score) {
            return left.score - right.score;
          }

          return left.skill.name.localeCompare(right.skill.name);
        })
        .slice(0, 15)
        .map(({ skill }) => ({
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
