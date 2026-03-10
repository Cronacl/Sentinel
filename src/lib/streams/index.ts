import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream/generic";

import {
  createInMemoryPublisher,
  createInMemorySubscriber,
} from "./resumable-stream-adapter";

export const streamContext = createResumableStreamContext({
  waitUntil: after,
  publisher: createInMemoryPublisher(),
  subscriber: createInMemorySubscriber(),
});
