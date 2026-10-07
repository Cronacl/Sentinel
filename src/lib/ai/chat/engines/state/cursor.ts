import { acpThreadStateSchema, type AcpThreadState } from "./acp";

// Cursor talks ACP; its state is the shared ACP state.
export const cursorThreadStateSchema = acpThreadStateSchema;

export type CursorThreadState = AcpThreadState;
