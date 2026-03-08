"use client";

import { Spinner } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UIMessage } from "ai";
import { memo, useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      className="flex h-6 w-6 items-center justify-center rounded-md text-muted/50 transition-colors hover:text-foreground"
      onClick={() => void handleCopy()}
      title="Copy code"
      type="button"
    >
      <HugeiconsIcon
        color="currentColor"
        icon={copied ? Tick01Icon : Copy01Icon}
        size={13}
        strokeWidth={1.5}
      />
    </button>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    return extractText(el.props.children);
  }
  return "";
}

function CodeBlock({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const language =
    className?.replace("hljs language-", "").replace("hljs ", "") ?? "";
  const codeString =
    typeof children === "string" ? children : extractText(children);

  return (
    <div className="sentinel-code-block group relative my-3 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-default/40 px-3 py-1.5">
        <span className="text-[11px] font-medium text-muted/50">
          {language || "code"}
        </span>
        <CopyButton text={codeString.trim()} />
      </div>
      <pre className="overflow-x-auto p-3">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-border bg-default/50 px-1 py-0.5 text-[13px] text-foreground">
      {children}
    </code>
  );
}

const markdownComponents: import("react-markdown").Components = {
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children }) {
    const isBlock = className?.includes("hljs");
    if (isBlock) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }
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
      <th className="border-b border-border bg-default/30 px-3 py-2 text-left text-xs font-semibold text-muted">
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
};

function MessageContent({ text }: { text: string }) {
  return (
    <div className="sentinel-prose">
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeHighlight]}
        remarkPlugins={[remarkGfm]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function getMessageText(message: UIMessage): string {
  for (const part of message.parts) {
    if (part.type === "text") return part.text;
  }
  return "";
}

type ChatMessageProps = {
  message: UIMessage;
  isStreaming?: boolean;
};

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming = false,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const text = useMemo(() => getMessageText(message), [message]);
  const isEmpty = !text.trim();

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-surface-secondary/50 dark:bg-surface px-3 py-2">
          <p className="text-[14px] leading-relaxed text-foreground whitespace-pre-wrap">
            {text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2">
      {isEmpty && isStreaming ? (
        <div className="flex items-center gap-2 py-1">
          <Spinner color="current" size="sm" />
          <span className="text-sm text-muted">Thinking...</span>
        </div>
      ) : (
        <MessageContent text={text} />
      )}
    </div>
  );
});
