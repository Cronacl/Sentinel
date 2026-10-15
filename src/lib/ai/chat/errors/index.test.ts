import { describe, expect, it } from "bun:test";

import {
  EngineInstanceUnavailableError,
  EngineTriggerUnsupportedError,
} from "@/lib/ai/chat/engines/platform/errors";

import {
  InvalidThreadChatRequestError,
  ThreadChatConflictError,
  createThreadChatErrorResponse,
  normalizeThreadChatErrorMessage,
} from "./index";

describe("createThreadChatErrorResponse", () => {
  it("returns 400 for invalid thread chat requests", async () => {
    const response = createThreadChatErrorResponse(
      new InvalidThreadChatRequestError("Missing required fields"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Missing required fields" },
    });
  });

  it("returns 409 for thread chat conflicts", async () => {
    const response = createThreadChatErrorResponse(
      new ThreadChatConflictError(
        "That Claude approval request is no longer active.",
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: { message: "That Claude approval request is no longer active." },
    });
  });

  it("returns a typed 409 when the thread's engine instance cannot run", async () => {
    const response = createThreadChatErrorResponse(
      new EngineInstanceUnavailableError(
        "claude-work",
        "claude",
        "missing",
        'Engine instance "claude-work" no longer exists.',
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "engine_unavailable",
        message: 'Engine instance "claude-work" no longer exists.',
      },
    });
  });

  it("returns a typed 409 for a trigger the engine does not handle", async () => {
    const response = createThreadChatErrorResponse(
      new EngineTriggerUnsupportedError("codex", "retry-assistant-message"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "engine_trigger_unsupported",
        message: 'This engine does not support "retry-assistant-message" yet.',
      },
    });
  });

  it("unwraps object-shaped errors into readable messages", async () => {
    const response = createThreadChatErrorResponse({
      error: {
        message: "Provider request failed.",
      },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Provider request failed." },
    });
  });

  it("normalizes nested provider error arrays", () => {
    expect(
      normalizeThreadChatErrorMessage({
        response: {
          data: {
            errors: [
              { message: "First provider failure." },
              { details: "Second provider detail." },
            ],
          },
        },
      }),
    ).toBe("First provider failure.\nSecond provider detail.");
  });
});
