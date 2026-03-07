import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { User } from "@/../generated/prisma";
import { env } from "@/env";
import { db } from "@/server/db";

type LocalProfileState = {
  localProfileId?: string;
};

export type LocalSession = {
  user: {
    email: string;
    id: string;
    image: string | null;
    name: string;
  };
};

function getDefaultProfileSeed() {
  const machineName =
    process.env.USER ||
    process.env.USERNAME ||
    os.userInfo().username ||
    "local-user";

  return {
    email: "local@sentinel.app",
    name: `Sentinel (${machineName})`,
  };
}

function getStatePath() {
  if (env.SENTINEL_STATE_PATH?.trim()) {
    return env.SENTINEL_STATE_PATH.trim();
  }

  return path.join(os.homedir(), ".sentinel", "state.json");
}

async function readState(): Promise<LocalProfileState> {
  try {
    const raw = await readFile(getStatePath(), "utf8");
    return JSON.parse(raw) as LocalProfileState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeState(state: LocalProfileState) {
  const statePath = getStatePath();
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function persistProfileId(profileId: string) {
  await writeState({ localProfileId: profileId });
}

async function createLocalProfile(): Promise<User> {
  const seed = getDefaultProfileSeed();
  const user = await db.user.upsert({
    where: { email: seed.email },
    update: {},
    create: {
      email: seed.email,
      emailVerified: true,
      id: randomUUID(),
      name: seed.name,
    },
  });

  await persistProfileId(user.id);
  return user;
}

export async function getOrCreateLocalProfile(): Promise<User> {
  const state = await readState();

  if (state.localProfileId) {
    const user = await db.user.findUnique({
      where: { id: state.localProfileId },
    });

    if (user) {
      return user;
    }
  }

  const existingUser = await db.user.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existingUser) {
    await persistProfileId(existingUser.id);
    return existingUser;
  }

  return createLocalProfile();
}

export async function getLocalSession(): Promise<LocalSession> {
  const user = await getOrCreateLocalProfile();

  return {
    user: {
      email: user.email,
      id: user.id,
      image: user.image,
      name: user.name,
    },
  };
}
