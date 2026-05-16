import { runParsedThreadChat } from "./thread-chat/orchestrator";

export async function runThreadChat(rawInput: unknown, userId: string) {
  return runParsedThreadChat(rawInput, userId);
}
