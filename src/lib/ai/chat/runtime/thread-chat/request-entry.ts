import { persistUploadedMediaParts } from "@/lib/uploaded-media";

import { parseRequest } from "../parse-request";
import { logRuntimeTiming } from "./runtime-timing";

// Keep request parsing and uploaded-media persistence together so the
// orchestrator only receives a normalized ThreadChatRequest.
export async function prepareThreadChatRequest(
  rawInput: unknown,
  userId: string,
  timingStartedAt: number,
) {
  const parsedRequest = await parseRequest(rawInput, userId);
  const request = parsedRequest.message
    ? {
        ...parsedRequest,
        message: await persistUploadedMediaParts({
          message: parsedRequest.message,
          threadId: parsedRequest.threadId,
          userId: parsedRequest.userId,
        }),
      }
    : parsedRequest;

  logRuntimeTiming("request_received", timingStartedAt, {
    threadId: request.threadId,
    trigger: request.trigger,
    userId: request.userId,
    workspaceId: request.workspaceId,
  });

  return request;
}
