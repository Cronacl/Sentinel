import type { ThreadMessageRole } from "@/server/db/enums";

import {
  mergeThreadMessageMetadata,
  normalizeThreadMessageMetadata,
  normalizeThreadUIMessage,
  type ThreadMessageMetadata,
  type ThreadUIMessage,
} from "./types";

export type PersistedThreadMessageRecord = {
  createdAt: Date;
  id: string;
  messageId: string;
  metadata: unknown;
  parts: unknown;
  role: ThreadMessageRole;
  updatedAt: Date;
};

type ThreadMessageNode = {
  createdAt: Date;
  dbId: string;
  hasExplicitParent: boolean;
  message: ThreadUIMessage;
  metadata: ThreadMessageMetadata;
  parentMessageId: string | null;
  updatedAt: Date;
};

function getTextPreview(message: ThreadUIMessage) {
  const text = message.parts.find(
    (
      part,
    ): part is Extract<ThreadUIMessage["parts"][number], { type: "text" }> =>
      part.type === "text" && part.text.trim().length > 0,
  )?.text;

  return text?.trim().slice(0, 48) ?? "";
}

function makeSiblingLabel(
  node: ThreadMessageNode,
  index: number,
  siblingCount: number,
) {
  const preview = getTextPreview(node.message);

  if (node.message.role === "user") {
    return preview || `Edit ${index + 1}`;
  }

  if (preview) {
    return preview;
  }

  if (siblingCount === 1) {
    return "Response";
  }

  return `Response ${index + 1}`;
}

function normalizeNode(record: PersistedThreadMessageRecord) {
  const rawMetadata =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : null;
  const message = normalizeThreadUIMessage({
    id: record.messageId,
    metadata: normalizeThreadMessageMetadata(
      record.metadata as ThreadMessageMetadata | null | undefined,
    ),
    parts: record.parts as ThreadUIMessage["parts"],
    role: record.role,
  });
  const metadata = normalizeThreadMessageMetadata(message.metadata);

  return {
    createdAt: record.createdAt,
    dbId: record.id,
    hasExplicitParent: rawMetadata
      ? Object.prototype.hasOwnProperty.call(rawMetadata, "parentMessageId")
      : false,
    message,
    metadata,
    parentMessageId: metadata.parentMessageId ?? null,
    updatedAt: record.updatedAt,
  } satisfies ThreadMessageNode;
}

function materializeNodes(records: PersistedThreadMessageRecord[]) {
  const sorted = [...records].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const nodes = sorted.map((record, index, all) => {
    const node = normalizeNode(record);
    if (node.hasExplicitParent || node.parentMessageId != null) {
      if (
        node.message.role === "assistant" &&
        node.parentMessageId == null &&
        !node.metadata.branchId
      ) {
        const previous = all[index - 1];
        if (!previous) {
          return node;
        }

        return {
          ...node,
          parentMessageId: previous.messageId,
        };
      }

      return node;
    }

    const previous = all[index - 1];
    if (!previous) {
      return node;
    }

    return {
      ...node,
      parentMessageId: previous.messageId,
    };
  });

  const nodesByMessageId = new Map(
    nodes.map((node) => [node.message.id, node]),
  );

  return nodes.map((node) => {
    const editedFromMessageId = node.metadata.editedFromMessageId;
    if (
      node.message.role !== "user" ||
      !editedFromMessageId ||
      node.parentMessageId !== editedFromMessageId
    ) {
      return node;
    }

    const editedTarget = nodesByMessageId.get(editedFromMessageId);
    if (!editedTarget) {
      return node;
    }

    return {
      ...node,
      parentMessageId: editedTarget.parentMessageId,
    };
  });
}

function groupChildren(nodes: ThreadMessageNode[]) {
  const children = new Map<string | null, ThreadMessageNode[]>();

  for (const node of nodes) {
    const key = node.parentMessageId;
    const current = children.get(key) ?? [];
    current.push(node);
    children.set(key, current);
  }

  for (const [, siblings] of children) {
    siblings.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  return children;
}

function getActiveSibling(siblings: ThreadMessageNode[]) {
  const activeSiblings = siblings.filter((node) => node.metadata.isActive);
  return activeSiblings[activeSiblings.length - 1] ?? siblings.at(-1) ?? null;
}

export function buildActiveThreadMessages(
  records: PersistedThreadMessageRecord[],
) {
  const nodes = materializeNodes(records);
  if (nodes.length === 0) {
    return [];
  }

  const children = groupChildren(nodes);
  const transcript: ThreadUIMessage[] = [];

  let current = getActiveSibling(children.get(null) ?? []);
  while (current) {
    const siblings = children.get(current.parentMessageId) ?? [];
    const branchOptions =
      siblings.length > 1
        ? siblings.map((node, index) => ({
            isActive: node.message.id === current?.message.id,
            label: makeSiblingLabel(node, index, siblings.length),
            messageId: node.message.id,
            role: node.message.role,
            status: node.metadata.status,
          }))
        : undefined;

    transcript.push({
      ...current.message,
      metadata: mergeThreadMessageMetadata(current.metadata, {
        ...(branchOptions ? { branchOptions } : {}),
        isActive: true,
        parentMessageId: current.parentMessageId,
      }),
    });

    current = getActiveSibling(children.get(current.message.id) ?? []);
  }

  return transcript;
}

export function getBranchSelectionPayload(
  records: PersistedThreadMessageRecord[],
  messageId: string,
) {
  const nodes = materializeNodes(records);
  const target = nodes.find((node) => node.message.id === messageId);

  if (!target) {
    return null;
  }

  const siblings = nodes.filter(
    (node) => node.parentMessageId === target.parentMessageId,
  );

  return {
    siblings,
    target,
  };
}

export function getMessageRecordById(
  records: PersistedThreadMessageRecord[],
  messageId: string,
) {
  return materializeNodes(records).find(
    (node) => node.message.id === messageId,
  );
}

export function getLatestVisibleMessageId(
  records: PersistedThreadMessageRecord[],
) {
  return buildActiveThreadMessages(records).at(-1)?.id ?? null;
}
