"use client";

import { memo, type ReactElement, type ReactNode, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "./code-block";

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

export const MarkdownContent = memo(function MarkdownContent({
  isStreaming = false,
  text,
  variant = "answer",
}: {
  isStreaming?: boolean;
  text: string;
  variant?: "answer" | "reasoning" | "reasoning-timeline";
}) {
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
        return (
          <a
            className="text-blue-400 underline decoration-blue-400/30 underline-offset-2 transition-colors hover:decoration-blue-400"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {children}
          </a>
        );
      },
      table({ children }) {
        return (
          <div className="my-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">{children}</table>
          </div>
        );
      },
      th({ children }) {
        return (
          <th className="border-b border-border bg-default/30 px-3 py-2 text-left text-xs font-medium text-muted">
            {children}
          </th>
        );
      },
      td({ children }) {
        return (
          <td className="border-b border-border/40 px-3 py-2 text-foreground">
            {children}
          </td>
        );
      },
      hr() {
        return null;
      },
    }),
    [isStreaming],
  );

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
        remarkPlugins={[remarkGfm]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
