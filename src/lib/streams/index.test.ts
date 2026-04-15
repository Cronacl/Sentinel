// @ts-nocheck

import { afterEach, describe, expect, it } from "bun:test";

import {
  safelyCloseReadableStreamController,
  safelyEnqueueReadableStreamController,
  streamContext,
} from "./index";

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

  it("treats duplicate controller close/enqueue calls as no-ops", async () => {
    let controller: ReadableStreamDefaultController<string> | null = null;

    const stream = new ReadableStream<string>({
      start(nextController) {
        controller = nextController;
      },
    });

    const reader = stream.getReader();

    expect(
      safelyEnqueueReadableStreamController(controller, "data: first\n\n"),
    ).toBe(true);
    expect(await reader.read()).toEqual({
      done: false,
      value: "data: first\n\n",
    });

    expect(safelyCloseReadableStreamController(controller)).toBe(true);
    expect(safelyCloseReadableStreamController(controller)).toBe(false);
    expect(
      safelyEnqueueReadableStreamController(controller, "data: second\n\n"),
    ).toBe(false);
    expect(await reader.read()).toEqual({
      done: true,
      value: undefined,
    });
  });

  it("does not fail when a replay listener disconnects before upstream closes", async () => {
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

    const reader = resumed!.getReader();
    expect(await reader.read()).toEqual({
      done: false,
      value: "data: first\n\n",
    });

    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("caps retained stream history so long runs do not keep every chunk", async () => {
    const streamId = `test-${crypto.randomUUID()}`;
    const largeChunk = "x".repeat(300_000);

    await streamContext.createNewResumableStream(
      streamId,
      () =>
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue(`data: first-${largeChunk}\n\n`);
            controller.enqueue(`data: second-${largeChunk}\n\n`);
            controller.enqueue(`data: third-${largeChunk}\n\n`);
            controller.close();
          },
        }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const resumed = await streamContext.resumeExistingStream(streamId);

    expect(resumed).toBeDefined();

    const text = await readTextStream(resumed!);
    expect(text.includes("data: first-")).toBe(false);
    expect(text.includes("data: second-")).toBe(false);
    expect(text.includes("data: third-")).toBe(true);
  });
});
