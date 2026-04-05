import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

import { env } from "@/env";
import { getSentinelStateFilePath } from "@/lib/runtime/local-state";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export type User = InferSelectModel<typeof users>;

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

let localProfilePromise: Promise<User> | null = null;
let localSessionPromise: Promise<LocalSession> | null = null;

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
  return getSentinelStateFilePath({
    env: {
      ...process.env,
      SENTINEL_STATE_PATH: env.SENTINEL_STATE_PATH,
    },
  });
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

  const existing = await db.query.users.findFirst({
    where: eq(users.email, seed.email),
  });

  if (existing) {
    return existing;
  }

  const id = randomUUID();
  db.insert(users)
    .values({
      email: seed.email,
      emailVerified: true,
      id,
      name: seed.name,
    })
    .onConflictDoNothing({ target: users.email })
    .run();

  const user = await db.query.users.findFirst({
    where: eq(users.email, seed.email),
  });

  await persistProfileId(user!.id);
  return user!;
}

export async function getOrCreateLocalProfile(): Promise<User> {
  if (!localProfilePromise) {
    localProfilePromise = (async () => {
      const state = await readState();

      if (state.localProfileId) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, state.localProfileId),
        });

        if (user) {
          return user;
        }
      }

      const existingUser = await db.query.users.findFirst({
        orderBy: (users, { asc }) => [asc(users.createdAt)],
      });

      if (existingUser) {
        await persistProfileId(existingUser.id);
        return existingUser;
      }

      return createLocalProfile();
    })().catch((error) => {
      localProfilePromise = null;
      throw error;
    });
  }

  return localProfilePromise;
}

export async function getLocalSession(): Promise<LocalSession> {
  if (!localSessionPromise) {
    localSessionPromise = getOrCreateLocalProfile()
      .then((user) => ({
        user: {
          email: user.email,
          id: user.id,
          image: user.image,
          name: user.name,
        },
      }))
      .catch((error) => {
        localSessionPromise = null;
        throw error;
      });
  }

  return localSessionPromise;
}
