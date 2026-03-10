import { EventEmitter } from "node:events";
import type { Publisher, Subscriber } from "resumable-stream/generic";

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const store = new Map<string, string>();
const timers = new Map<string, NodeJS.Timeout>();

export function createInMemoryPublisher(): Publisher {
  return {
    connect: async () => {},

    publish: async (channel: string, message: string) => {
      emitter.emit(channel, message);
    },

    set: async (
      key: string,
      value: string,
      options?: { EX?: number },
    ): Promise<"OK"> => {
      store.set(key, value);

      if (options?.EX) {
        const existing = timers.get(key);
        if (existing) clearTimeout(existing);
        timers.set(
          key,
          setTimeout(() => {
            store.delete(key);
            timers.delete(key);
          }, options.EX * 1000),
        );
      }

      return "OK";
    },

    get: async (key: string) => store.get(key) ?? null,

    incr: async (key: string) => {
      const val = parseInt(store.get(key) ?? "0", 10) + 1;
      store.set(key, String(val));
      return val;
    },
  };
}

export function createInMemorySubscriber(): Subscriber {
  return {
    connect: async () => {},

    subscribe: async (channel: string, callback: (message: string) => void) => {
      emitter.on(channel, callback);
    },

    unsubscribe: async (channel: string) => {
      emitter.removeAllListeners(channel);
    },
  };
}
