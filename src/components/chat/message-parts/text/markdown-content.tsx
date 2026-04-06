"use client";

import {
  memo,
  type ReactElement,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useMemo,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sileo } from "sileo";

import { useWorkspaceFileLinkRootPath } from "@/components/chat/workspace-file-link-context";
import { getDesktopApi } from "@/lib/desktop/client";
import { getErrorMessage } from "@/lib/errors";

import { resolveWorkspaceFileLink } from "./file-link";
import { CodeBlock } from "./code-block";

const REMARK_PLUGINS = [remarkGfm];

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return extractText(el.props.children);
  }
  return "";
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-border bg-default/50 px-1 py-0.5 text-[13px] text-foreground">
      {children}
    </code>
  );
}

function getPreferredEditorTarget(
  openTargets: Array<{
    id: string;
    kind: "editor" | "file_manager" | "ide" | "terminal";
  }>,
) {
  return (
    openTargets.find(
      (target) => target.kind === "editor" || target.kind === "ide",
    ) ?? null
  );
}

export const MarkdownContent = memo(function MarkdownContent({
  isStreaming = false,
  text,
  variant = "answer",
}: {
  isStreaming?: boolean;
  text: string;
  variant?: "answer" | "reasoning" | "reasoning-timeline";
}) {
  const workspaceRootPath = useWorkspaceFileLinkRootPath();
  const handleFileLinkClick = useCallback(
    async (href: string) => {
      const resolvedLink = resolveWorkspaceFileLink(href, workspaceRootPath);
      if (!resolvedLink || !workspaceRootPath) {
        return;
      }

      const desktop = getDesktopApi();
      if (!desktop) {
        return;
      }

      try {
        const openTargets =
          await desktop.workspace.listOpenTargets(workspaceRootPath);
        const preferredEditorTarget = getPreferredEditorTarget(openTargets);

        await desktop.workspace.openFileInTarget(
          workspaceRootPath,
          resolvedLink.filePath,
          preferredEditorTarget?.id,
          resolvedLink.lineNumber ?? undefined,
        );
      } catch (error) {
        sileo.error({
          description: getErrorMessage(error, "Unable to open that file."),
          title: "Open file failed",
        });
      }
    },
    [workspaceRootPath],
  );

  const markdownComponents = useMemo<import("react-markdown").Components>(
    () => ({
      pre({ children }) {
        if (
          typeof children === "object" &&
          children !== null &&
          "props" in children
        ) {
          const codeElement = children as ReactElement<{
            children?: ReactNode;
            className?: string;
          }>;
          const code = extractText(codeElement.props.children);

          return (
            <CodeBlock
              code={code}
              language={codeElement.props.className}
              shouldHighlight={!isStreaming}
            />
          );
        }

        return <pre>{children}</pre>;
      },
      code({ children }) {
        return <InlineCode>{children}</InlineCode>;
      },
      a({ href, children }) {
        const resolvedFileLink = resolveWorkspaceFileLink(
          href,
          workspaceRootPath,
        );

        return (
          <a
            className="text-blue-400 underline decoration-blue-400/30 underline-offset-2 transition-colors hover:decoration-blue-400"
            href={href}
            onClick={(event) => {
              if (!href || !resolvedFileLink) {
                return;
              }

              event.preventDefault();
              void handleFileLinkClick(href);
            }}
            rel="noopener noreferrer"
            target={resolvedFileLink ? undefined : "_blank"}
          >
            {children}
          </a>
        );
      },
      table({ children }) {
        return (
          <div className="my-3 overflow-x-auto rounded-2xl border border-separator/50">
            <table className="w-full text-sm border-separator/50">
              {children}
            </table>
          </div>
        );
      },
      th({ children }) {
        return (
          <th className="border-b border-separator/50 bg-background/50 dark:bg-surface/50 px-3 py-2 text-left text-xs font-medium text-muted">
            {children}
          </th>
        );
      },
      td({ children }) {
        return (
          <td className="border-b border-separator/50 bg-background/20 dark:bg-surface/20 px-3 py-2 text-foreground">
            {children}
          </td>
        );
      },
      hr() {
        return null;
      },
    }),
    [handleFileLinkClick, isStreaming, workspaceRootPath],
  );

  const deferredText = useDeferredValue(text);

  return (
    <div
      className={
        variant === "answer"
          ? "sentinel-prose"
          : variant === "reasoning-timeline"
            ? "sentinel-reasoning-timeline-prose"
            : "sentinel-reasoning-prose"
      }
    >
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={REMARK_PLUGINS}
      >
        {deferredText}
      </ReactMarkdown>
    </div>
  );
});
