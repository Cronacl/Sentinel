import { createResumableStreamContext } from "resumable-stream/generic";

import {
  createInMemoryPublisher,
  createInMemorySubscriber,
} from "./resumable-stream-adapter";

export const streamContext = createResumableStreamContext({
  waitUntil: null,
  publisher: createInMemoryPublisher(),
  subscriber: createInMemorySubscriber(),
});
