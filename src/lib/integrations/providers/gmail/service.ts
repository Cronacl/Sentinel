import "server-only";

import { OAuth2Client } from "google-auth-library";
import { gmail_v1, google } from "googleapis";

export type ParsedEmail = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  labelIds: string[];
  isUnread: boolean;
  isStarred: boolean;
  attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
  }>;
};

function decodeBodyData(data?: string | null): string {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf-8");
}

function findBestBodyPart(
  payload?: gmail_v1.Schema$MessagePart | null,
): { mimeType: string; body: string } | null {
  if (!payload) return null;

  const ownBody = decodeBodyData(payload.body?.data);
  if (ownBody) {
    return {
      mimeType: payload.mimeType ?? "text/plain",
      body: ownBody,
    };
  }

  const parts = payload.parts ?? [];

  for (const mimeType of ["text/html", "text/plain"]) {
    for (const part of parts) {
      if (part.mimeType === mimeType) {
        const body = decodeBodyData(part.body?.data);
        if (body) {
          return { mimeType, body };
        }
      }
    }
  }

  for (const part of parts) {
    const nested = findBestBodyPart(part);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function collectAttachments(
  part: gmail_v1.Schema$MessagePart | null | undefined,
  attachments: ParsedEmail["attachments"],
): void {
  if (!part) return;

  if (part.filename && part.body?.attachmentId) {
    attachments.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
    });
  }

  for (const child of part.parts ?? []) {
    collectAttachments(child, attachments);
  }
}

function parseMessage(message: gmail_v1.Schema$Message): ParsedEmail {
  const headers = message.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    "";

  const labelIds = message.labelIds ?? [];
  const bestBody = findBestBodyPart(message.payload);
  const body = bestBody?.body ?? "";

  const attachments: ParsedEmail["attachments"] = [];
  collectAttachments(message.payload, attachments);

  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    from: getHeader("From"),
    to: getHeader("To"),
    cc: getHeader("Cc"),
    bcc: getHeader("Bcc"),
    subject: getHeader("Subject"),
    snippet: message.snippet ?? "",
    body,
    date: getHeader("Date"),
    labelIds,
    isUnread: labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    attachments,
  };
}

function createRawMessage(params: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  from?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}): string {
  const lines = [
    `To: ${params.to}`,
    ...(params.from ? [`From: ${params.from}`] : []),
    `Subject: ${params.subject}`,
    ...(params.cc ? [`Cc: ${params.cc}`] : []),
    ...(params.bcc ? [`Bcc: ${params.bcc}`] : []),
    ...(params.inReplyTo ? [`In-Reply-To: ${params.inReplyTo}`] : []),
    ...(params.references ? [`References: ${params.references}`] : []),
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    params.body,
  ];

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export class GmailService {
  private gmail: gmail_v1.Gmail;

  constructor(accessToken: string) {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    this.gmail = google.gmail({ version: "v1", auth });
  }

  async searchEmails(params: {
    query?: string;
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ emails: ParsedEmail[]; nextPageToken?: string }> {
    const { query, labelIds, maxResults = 20, pageToken } = params;

    const response = await this.gmail.users.messages.list({
      userId: "me",
      q: query,
      labelIds,
      maxResults,
      pageToken,
    });

    if (!response.data.messages?.length) {
      return { emails: [] };
    }

    const emails = await Promise.all(
      response.data.messages.map(async (msg) => {
        const full = await this.gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });
        return parseMessage(full.data);
      }),
    );

    return {
      emails,
      nextPageToken: response.data.nextPageToken ?? undefined,
    };
  }

  async getEmail(messageId: string): Promise<ParsedEmail> {
    const response = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    return parseMessage(response.data);
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
  }): Promise<{ messageId: string; threadId: string }> {
    const raw = createRawMessage(params);
    const response = await this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return {
      messageId: response.data.id ?? "",
      threadId: response.data.threadId ?? "",
    };
  }

  async createDraft(params: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
  }): Promise<{ draftId: string; messageId: string }> {
    const raw = createRawMessage(params);
    const response = await this.gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });
    return {
      draftId: response.data.id ?? "",
      messageId: response.data.message?.id ?? "",
    };
  }

  async replyToEmail(params: {
    messageId: string;
    body: string;
    cc?: string;
    bcc?: string;
  }): Promise<{ messageId: string; threadId: string }> {
    const original = await this.getEmail(params.messageId);
    const raw = createRawMessage({
      to: original.from,
      subject: original.subject.startsWith("Re:")
        ? original.subject
        : `Re: ${original.subject}`,
      body: params.body,
      cc: params.cc,
      bcc: params.bcc,
      inReplyTo: original.id,
      references: original.id,
    });

    const response = await this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: original.threadId },
    });
    return {
      messageId: response.data.id ?? "",
      threadId: response.data.threadId ?? "",
    };
  }

  async listLabels(): Promise<
    Array<{ id: string; name: string; type: string }>
  > {
    const response = await this.gmail.users.labels.list({ userId: "me" });
    return (response.data.labels ?? []).map((label) => ({
      id: label.id ?? "",
      name: label.name ?? "",
      type: label.type ?? "user",
    }));
  }

  async manageLabels(params: {
    messageIds: string[];
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<{ modifiedCount: number }> {
    let count = 0;
    for (const msgId of params.messageIds) {
      await this.gmail.users.messages.modify({
        userId: "me",
        id: msgId,
        requestBody: {
          addLabelIds: params.addLabelIds,
          removeLabelIds: params.removeLabelIds,
        },
      });
      count++;
    }
    return { modifiedCount: count };
  }

  async archiveEmail(messageId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { removeLabelIds: ["INBOX"] },
    });
  }

  async trashEmail(messageId: string): Promise<void> {
    await this.gmail.users.messages.trash({
      userId: "me",
      id: messageId,
    });
  }

  async starEmail(messageId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds: ["STARRED"] },
    });
  }

  async unstarEmail(messageId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { removeLabelIds: ["STARRED"] },
    });
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
  }

  async markAsUnread(messageId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds: ["UNREAD"] },
    });
  }

  async forwardEmail(params: {
    messageId: string;
    to: string;
    additionalBody?: string;
  }): Promise<{ messageId: string; threadId: string }> {
    const original = await this.getEmail(params.messageId);

    const forwardHeader = [
      params.additionalBody ?? "",
      "<br/><br/>---------- Forwarded message ----------",
      `<br/>From: ${original.from}`,
      `<br/>Date: ${original.date}`,
      `<br/>Subject: ${original.subject}`,
      `<br/>To: ${original.to}`,
      original.cc ? `<br/>Cc: ${original.cc}` : "",
      "<br/><br/>",
      original.body,
    ]
      .filter(Boolean)
      .join("");

    const raw = createRawMessage({
      to: params.to,
      subject: original.subject.startsWith("Fwd:")
        ? original.subject
        : `Fwd: ${original.subject}`,
      body: forwardHeader,
    });

    const response = await this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return {
      messageId: response.data.id ?? "",
      threadId: response.data.threadId ?? "",
    };
  }

  async getThread(
    threadId: string,
  ): Promise<{ threadId: string; messages: ParsedEmail[] }> {
    const response = await this.gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const messages = (response.data.messages ?? []).map(parseMessage);

    return {
      threadId: response.data.id ?? threadId,
      messages,
    };
  }

  async bulkModify(
    messageIds: string[],
    action:
      | "archive"
      | "trash"
      | "star"
      | "unstar"
      | "mark_read"
      | "mark_unread",
  ): Promise<{ modifiedCount: number }> {
    const perform = (id: string): Promise<void> => {
      switch (action) {
        case "archive":
          return this.archiveEmail(id);
        case "trash":
          return this.trashEmail(id);
        case "star":
          return this.starEmail(id);
        case "unstar":
          return this.unstarEmail(id);
        case "mark_read":
          return this.markAsRead(id);
        case "mark_unread":
          return this.markAsUnread(id);
      }
    };

    let count = 0;
    for (const id of messageIds) {
      await perform(id);
      count++;
    }
    return { modifiedCount: count };
  }
}
