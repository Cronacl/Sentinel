export class InvalidThreadChatRequestError extends Error {
  constructor(message = "Missing required fields") {
    super(message);
    this.name = "InvalidThreadChatRequestError";
  }
}

export function createThreadChatErrorResponse(error: unknown) {
  if (error instanceof InvalidThreadChatRequestError) {
    return new Response(error.message, { status: 400 });
  }

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";

  return new Response(message, { status: 500 });
}
