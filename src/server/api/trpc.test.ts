import { describe, expect, it, mock } from "bun:test";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { z } from "zod";

mock.module("@/server/db", () => ({ db: {} }));
mock.module("@/server/db/schema", () => ({ users: { id: "user.id" } }));
mock.module("@/server/local-profile", () => ({
  getLocalSession: async () => null,
}));

const { createTRPCContext, createTRPCRouter, publicProcedure } =
  await import("./trpc");

const router = createTRPCRouter({
  echo: publicProcedure
    .input(
      z
        .object({
          count: z.number().int(),
          name: z.string().trim().min(1, "Name is required."),
        })
        .refine((input) => input.count < 10, "Count must stay below 10."),
    )
    .query(({ input }) => input),
  fail: publicProcedure.query(() => {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nope." });
  }),
});

async function callQuery(path: string, input?: unknown) {
  const url = new URL(`http://localhost/api/trpc/${path}`);
  if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify(superjson.serialize(input)));
  }

  const response = await fetchRequestHandler({
    createContext: () => createTRPCContext({ headers: new Headers() }),
    endpoint: "/api/trpc",
    req: new Request(url),
    router,
  });
  const body = (await response.json()) as {
    error?: Parameters<typeof superjson.deserialize>[0];
    result?: { data: Parameters<typeof superjson.deserialize>[0] };
  };

  return {
    data: body.result ? superjson.deserialize(body.result.data) : undefined,
    error: body.error
      ? superjson.deserialize<{
          data: { code: string; zodError: unknown };
          message: string;
        }>(body.error)
      : undefined,
    status: response.status,
  };
}

describe("tRPC error formatter", () => {
  it("passes valid input through", async () => {
    const result = await callQuery("echo", { count: 2, name: " Ada " });

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ count: 2, name: "Ada" });
  });

  it("flattens zod input errors into data.zodError", async () => {
    const result = await callQuery("echo", { count: 12, name: "  " });

    expect(result.status).toBe(400);
    expect(result.error?.data.code).toBe("BAD_REQUEST");
    expect(result.error?.data.zodError).toEqual({
      fieldErrors: { name: ["Name is required."] },
      formErrors: ["Count must stay below 10."],
    });
  });

  it("reports type errors per field", async () => {
    const result = await callQuery("echo", { count: "2", name: "Ada" });

    expect(result.status).toBe(400);
    expect(result.error?.data.zodError).toEqual({
      fieldErrors: { count: [expect.any(String)] },
      formErrors: [],
    });
  });

  it("leaves zodError empty for errors without a zod cause", async () => {
    const result = await callQuery("fail");

    expect(result.status).toBe(400);
    expect(result.error?.message).toBe("Nope.");
    expect(result.error?.data.zodError).toBeNull();
  });
});
