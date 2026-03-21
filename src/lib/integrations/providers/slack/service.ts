import "server-only";

import { WebClient } from "@slack/web-api";

export type SlChannel = {
  id: string;
  name: string;
  topic: string;
  purpose: string;
  isPrivate: boolean;
  isArchived: boolean;
  memberCount: number;
  createdAt: string;
};

export type SlMessage = {
  ts: string;
  text: string;
  userId: string;
  username: string;
  channelId: string;
  channelName: string;
  threadTs: string | null;
  replyCount: number;
  timestamp: string;
  permalink: string | null;
};

export type SlUser = {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  isBot: boolean;
  isActive: boolean;
  avatar: string | null;
  timezone: string | null;
};

function parseChannel(c: any): SlChannel {
  return {
    id: c.id ?? "",
    name: c.name ?? c.name_normalized ?? "",
    topic: c.topic?.value ?? "",
    purpose: c.purpose?.value ?? "",
    isPrivate: c.is_private ?? false,
    isArchived: c.is_archived ?? false,
    memberCount: c.num_members ?? 0,
    createdAt: c.created ? new Date(c.created * 1000).toISOString() : "",
  };
}

function parseMessage(m: any, channelId = "", channelName = ""): SlMessage {
  return {
    ts: m.ts ?? "",
    text: m.text ?? "",
    userId: m.user ?? m.bot_id ?? "",
    username: m.username ?? "",
    channelId: m.channel?.id ?? channelId,
    channelName: m.channel?.name ?? channelName,
    threadTs: m.thread_ts ?? null,
    replyCount: m.reply_count ?? 0,
    timestamp: m.ts ? new Date(parseFloat(m.ts) * 1000).toISOString() : "",
    permalink: m.permalink ?? null,
  };
}

function parseUser(u: any): SlUser {
  const profile = u.profile ?? {};
  return {
    id: u.id ?? "",
    name: u.name ?? "",
    realName: profile.real_name ?? u.real_name ?? "",
    displayName: profile.display_name ?? "",
    email: profile.email ?? null,
    isAdmin: u.is_admin ?? false,
    isBot: u.is_bot ?? false,
    isActive: !u.deleted,
    avatar: profile.image_72 ?? profile.image_48 ?? null,
    timezone: u.tz ?? null,
  };
}

export class SlackService {
  private client: WebClient;

  constructor(accessToken: string) {
    this.client = new WebClient(accessToken);
  }

  async listChannels(params: {
    types?: string;
    limit?: number;
    excludeArchived?: boolean;
  }): Promise<{ channels: SlChannel[]; totalCount: number }> {
    const res = await this.client.conversations.list({
      types: params.types ?? "public_channel,private_channel",
      limit: params.limit ?? 100,
      exclude_archived: params.excludeArchived ?? true,
    });
    const channels = (res.channels ?? []).map(parseChannel);
    return { channels, totalCount: channels.length };
  }

  async getChannel(channelId: string): Promise<SlChannel> {
    const res = await this.client.conversations.info({ channel: channelId });
    return parseChannel(res.channel);
  }

  async createChannel(params: {
    name: string;
    isPrivate?: boolean;
  }): Promise<SlChannel> {
    const res = await this.client.conversations.create({
      name: params.name,
      is_private: params.isPrivate ?? false,
    });
    return parseChannel(res.channel);
  }

  async archiveChannel(channelId: string): Promise<{ success: boolean }> {
    await this.client.conversations.archive({ channel: channelId });
    return { success: true };
  }

  async inviteToChannel(params: {
    channelId: string;
    userIds: string[];
  }): Promise<{ success: boolean }> {
    await this.client.conversations.invite({
      channel: params.channelId,
      users: params.userIds.join(","),
    });
    return { success: true };
  }

  async kickFromChannel(params: {
    channelId: string;
    userId: string;
  }): Promise<{ success: boolean }> {
    await this.client.conversations.kick({
      channel: params.channelId,
      user: params.userId,
    });
    return { success: true };
  }

  async setTopic(params: {
    channelId: string;
    topic: string;
  }): Promise<{ topic: string }> {
    const res = await this.client.conversations.setTopic({
      channel: params.channelId,
      topic: params.topic,
    });
    return { topic: (res.channel as any)?.topic?.value ?? params.topic };
  }

  async setPurpose(params: {
    channelId: string;
    purpose: string;
  }): Promise<{ purpose: string }> {
    const res = await this.client.conversations.setPurpose({
      channel: params.channelId,
      purpose: params.purpose,
    });
    return { purpose: (res.channel as any)?.purpose?.value ?? params.purpose };
  }

  async searchMessages(params: {
    query: string;
    count?: number;
    sortBy?: string;
    sortDir?: string;
  }): Promise<{ messages: SlMessage[]; totalCount: number }> {
    const q = params.query?.trim();
    if (!q) throw new Error("Search query must not be empty.");
    const res = await this.client.search.messages({
      query: q,
      count: params.count ?? 20,
      sort: (params.sortBy as any) ?? "timestamp",
      sort_dir: (params.sortDir as any) ?? "desc",
    });
    const matches = (res.messages?.matches ?? []) as any[];
    const messages = matches.map((m) => parseMessage(m));
    return {
      messages,
      totalCount: (res.messages?.total as number) ?? messages.length,
    };
  }

  async postMessage(params: {
    channelId: string;
    text: string;
  }): Promise<SlMessage> {
    const res = await this.client.chat.postMessage({
      channel: params.channelId,
      text: params.text,
    });
    return parseMessage(res.message, params.channelId);
  }

  async replyToThread(params: {
    channelId: string;
    threadTs: string;
    text: string;
  }): Promise<SlMessage> {
    const res = await this.client.chat.postMessage({
      channel: params.channelId,
      thread_ts: params.threadTs,
      text: params.text,
    });
    return parseMessage(res.message, params.channelId);
  }

  async updateMessage(params: {
    channelId: string;
    ts: string;
    text: string;
  }): Promise<SlMessage> {
    const res = await this.client.chat.update({
      channel: params.channelId,
      ts: params.ts,
      text: params.text,
    });
    return {
      ts: res.ts ?? params.ts,
      text: res.text ?? params.text,
      userId: "",
      username: "",
      channelId: res.channel ?? params.channelId,
      channelName: "",
      threadTs: null,
      replyCount: 0,
      timestamp: res.ts
        ? new Date(parseFloat(res.ts) * 1000).toISOString()
        : "",
      permalink: null,
    };
  }

  async deleteMessage(params: {
    channelId: string;
    ts: string;
  }): Promise<{ success: boolean }> {
    await this.client.chat.delete({
      channel: params.channelId,
      ts: params.ts,
    });
    return { success: true };
  }

  async addReaction(params: {
    channelId: string;
    ts: string;
    emoji: string;
  }): Promise<{ success: boolean }> {
    await this.client.reactions.add({
      channel: params.channelId,
      timestamp: params.ts,
      name: params.emoji.replace(/:/g, ""),
    });
    return { success: true };
  }

  async scheduleMessage(params: {
    channelId: string;
    text: string;
    postAt: number;
  }): Promise<{ scheduledMessageId: string; postAt: number }> {
    const res = await this.client.chat.scheduleMessage({
      channel: params.channelId,
      text: params.text,
      post_at: params.postAt,
    });
    return {
      scheduledMessageId: res.scheduled_message_id ?? "",
      postAt: (res.post_at as number) ?? params.postAt,
    };
  }

  async pinMessage(params: {
    channelId: string;
    ts: string;
  }): Promise<{ success: boolean }> {
    await this.client.pins.add({
      channel: params.channelId,
      timestamp: params.ts,
    });
    return { success: true };
  }

  async unpinMessage(params: {
    channelId: string;
    ts: string;
  }): Promise<{ success: boolean }> {
    await this.client.pins.remove({
      channel: params.channelId,
      timestamp: params.ts,
    });
    return { success: true };
  }

  async getThread(params: {
    channelId: string;
    threadTs: string;
    limit?: number;
  }): Promise<{ messages: SlMessage[]; totalCount: number }> {
    const res = await this.client.conversations.replies({
      channel: params.channelId,
      ts: params.threadTs,
      limit: params.limit ?? 50,
    });
    const messages = (res.messages ?? []).map((m: any) =>
      parseMessage(m, params.channelId),
    );
    return { messages, totalCount: messages.length };
  }

  async listUsers(params: {
    limit?: number;
  }): Promise<{ users: SlUser[]; totalCount: number }> {
    const res = await this.client.users.list({
      limit: params.limit ?? 200,
    });
    const users = (res.members ?? [])
      .filter((u: any) => !u.is_bot && u.id !== "USLACKBOT")
      .map(parseUser);
    return { users, totalCount: users.length };
  }

  async getUser(userId: string): Promise<SlUser> {
    const res = await this.client.users.info({ user: userId });
    return parseUser(res.user);
  }

  async getHistory(params: {
    channelId: string;
    limit?: number;
    oldest?: string;
    latest?: string;
  }): Promise<{ messages: SlMessage[]; totalCount: number }> {
    const opts: any = {
      channel: params.channelId,
      limit: params.limit ?? 30,
    };
    if (params.oldest) opts.oldest = params.oldest;
    if (params.latest) opts.latest = params.latest;
    const res = await this.client.conversations.history(opts);
    const messages = (res.messages ?? []).map((m: any) =>
      parseMessage(m, params.channelId),
    );
    return { messages, totalCount: messages.length };
  }
}
