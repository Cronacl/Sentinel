import {
  createThreadChatErrorResponse,
} from "@/lib/ai/chat/errors";
import { runThreadChat } from "@/lib/ai/chat";
import { getLocalSession } from "@/server/local-profile";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const session = await getLocalSession();
    const body = await req.json();

    return await runThreadChat(body, session.user.id);
  } catch (error) {
    return createThreadChatErrorResponse(error);
  }
}
