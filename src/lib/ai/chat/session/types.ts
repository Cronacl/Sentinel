import type { ChatEngine, ThreadStatus } from "@/server/db/enums";

import type { ReasoningEffort } from "../../providers/models";
import type { ThreadUIMessage } from "../../messages/types";
import type { ThreadMode } from "@/lib/plan";

export type QueuedFollowUpSummary = {
  attachmentCount: number;
  createdAt: Date | string;
  hasFiles: boolean;
  id: string;
  modelId: string;
  reasoningEffort: ReasoningEffort | null;
  status: "queued" | "processing";
  text: string;
  threadMode: ThreadMode;
};

export type ThreadSessionSnapshot = {
  activeRunId: string | null;
  chatEngine: ChatEngine;
  messages: ThreadUIMessage[];
  mode?: "chat" | "plan" | null;
  queuedFollowUps: QueuedFollowUpSummary[];
  threadId: string;
  threadTitle: string;
  threadStatus: ThreadStatus;
};

export type ThreadChatBootstrapResponse = {
  activeRunId: string;
  snapshot: ThreadSessionSnapshot;
};

export type ThreadStreamEvent =
  | {
      snapshot: ThreadSessionSnapshot;
      type: "thread.snapshot";
    }
  | {
      message: ThreadUIMessage;
      runId: string;
      type: "message.upsert";
    }
  | {
      messageId: string;
      runId: string;
      status:
        | "pending"
        | "streaming"
        | "completed"
        | "error"
        | "cancelled"
        | undefined;
      type: "message.status";
    }
  | {
      queuedFollowUps: QueuedFollowUpSummary[];
      runId: string;
      type: "queue.snapshot";
    }
  | {
      runId: string;
      type: "run.started";
    }
  | {
      runId: string;
      threadStatus: ThreadStatus;
      type: "run.finished";
    }
  | {
      messageId?: string;
      runId: string;
      threadStatus: ThreadStatus;
      type: "run.cancelled";
    }
  | {
      error: string;
      messageId?: string;
      runId: string;
      threadStatus: ThreadStatus;
      type: "run.failed";
    };
