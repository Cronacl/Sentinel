/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { TRPCError, initTRPC } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";

import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { getLocalSession } from "@/server/local-profile";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await getLocalSession();
  return {
    db,
    session,
    ...opts,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;

export const createTRPCRouter = t.router;

const trpcLog = createLogger("TRPC");

const timingMiddleware = t.middleware(async ({ next, path }) => {
  if (process.env.NODE_ENV !== "development") {
    return next();
  }

  const start = Date.now();
  const result = await next();
  const end = Date.now();
  trpcLog.debug(`${path} took ${end - start}ms to execute`);

  return result;
});

export const publicProcedure = t.procedure.use(timingMiddleware);

export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      with: {
        selectedWorkspace: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You are not logged in.",
      });
    }

    const selectedWorkspace = user.selectedWorkspace;

    return next({
      ctx: {
        session: { ...ctx.session, user: ctx.session.user },
        user,
        workspace:
          selectedWorkspace && !selectedWorkspace.isArchived
            ? selectedWorkspace
            : null,
      },
    });
  });
