import { getErrorMessage } from "@/lib/errors";

export class InvalidThreadChatRequestError extends Error {
  constructor(message = "Missing required fields") {
    super(message);
    this.name = "InvalidThreadChatRequestError";
  }
}

export class ThreadChatConflictError extends Error {
  constructor(message = "This action is no longer available.") {
    super(message);
    this.name = "ThreadChatConflictError";
  }
}

export function createThreadChatErrorResponse(error: unknown) {
  const message = getErrorMessage(error, "An unexpected error occurred");

  if (error instanceof InvalidThreadChatRequestError) {
    return Response.json(
      {
        error: {
          message,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof ThreadChatConflictError) {
    return Response.json(
      {
        error: {
          message,
        },
      },
      { status: 409 },
    );
  }

  return Response.json(
    {
      error: {
        message,
      },
    },
    { status: 500 },
  );
}

export function normalizeThreadChatErrorMessage(
  error: unknown,
  fallback = "Chat run failed.",
) {
  const message = getErrorMessage(error, fallback).trim();

  if (message && message !== "[object Object]") {
    return message;
  }

  return fallback;
}
