// @ts-nocheck

import { afterEach, describe, expect, it } from "bun:test";

import { streamContext } from "./index";

async function readTextStream(stream: ReadableStream<Uint8Array | string>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (typeof value === "string") {
      text += value;
    } else {
      text += decoder.decode(value, { stream: true });
    }
  }

  text += decoder.decode();
  return text;
}

describe("streamContext", () => {
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("replays prior chunks and continues streaming new ones", async () => {
    const streamId = `test-${crypto.randomUUID()}`;

    await streamContext.createNewResumableStream(
      streamId,
      () =>
        new ReadableStream<string>({
          async start(controller) {
            controller.enqueue("data: first\n\n");
            await new Promise((resolve) => setTimeout(resolve, 10));
            controller.enqueue("data: second\n\n");
            controller.close();
          },
        }),
    );

    await new Promise((resolve) => setTimeout(resolve, 5));

    const resumed = await streamContext.resumeExistingStream(streamId);

    expect(resumed).toBeDefined();
    expect(await readTextStream(resumed!)).toBe(
      "data: first\n\ndata: second\n\n",
    );
  });
});
