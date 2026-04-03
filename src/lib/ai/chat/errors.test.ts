import { describe, expect, it } from "bun:test";

import {
  InvalidThreadChatRequestError,
  ThreadChatConflictError,
  createThreadChatErrorResponse,
} from "./errors";

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
});
