// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const findMany = mock(async () => []);
const deleteRun = mock(() => undefined);
const deleteWhere = mock(() => ({ run: deleteRun }));
const deleteToolApprovalPolicy = mock(() => ({ where: deleteWhere }));
const insertRun = mock(() => undefined);
const insertValues = mock(() => ({ run: insertRun }));
const insertToolApprovalPolicy = mock(() => ({ values: insertValues }));
const transaction = mock((callback) =>
  callback({
    delete: deleteToolApprovalPolicy,
    insert: insertToolApprovalPolicy,
  }),
);

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
    }),
    query: (handler: any) => handler,
  },
}));

mock.module("@/server/db/schema", () => ({
  toolApprovalPolicies: {
    toolName: "toolApprovalPolicies.toolName",
    requireApproval: "toolApprovalPolicies.requireApproval",
    userId: "toolApprovalPolicies.userId",
  },
}));

const { approvalsRouter } = await import("./approvals");

beforeEach(() => {
  findMany.mockReset();
  deleteRun.mockReset();
  deleteWhere.mockReset();
  deleteToolApprovalPolicy.mockReset();
  insertRun.mockReset();
  insertValues.mockReset();
  insertToolApprovalPolicy.mockReset();
  transaction.mockReset();

  findMany.mockImplementation(async () => []);
  deleteWhere.mockImplementation(() => ({ run: deleteRun }));
  deleteToolApprovalPolicy.mockImplementation(() => ({ where: deleteWhere }));
  insertValues.mockImplementation(() => ({ run: insertRun }));
  insertToolApprovalPolicy.mockImplementation(() => ({ values: insertValues }));
  transaction.mockImplementation((callback) =>
    callback({
      delete: deleteToolApprovalPolicy,
      insert: insertToolApprovalPolicy,
    }),
  );
});

afterEach(() => {
  mock.restore();
});

describe("approvalsRouter", () => {
  it("returns effective defaults when no stored policies exist", async () => {
    const result = await approvalsRouter.get({
      ctx: {
        db: {
          query: {
            toolApprovalPolicies: {
              findMany,
            },
          },
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
    });

    expect(findMany).toHaveBeenCalled();
    expect(result.find((tool) => tool.toolName === "list")).toMatchObject({
      requireApproval: false,
      toolName: "list",
    });
    expect(result.find((tool) => tool.toolName === "edit")).toMatchObject({
      requireApproval: true,
      toolName: "edit",
    });
    expect(result.find((tool) => tool.toolName === "multiedit")).toMatchObject({
      requireApproval: true,
      toolName: "multiedit",
    });
  });

  it("persists a custom override and returns effective policies", async () => {
    findMany.mockImplementationOnce(async () => [
      { requireApproval: false, toolName: "edit" },
    ]);

    const result = await approvalsRouter.update({
      ctx: {
        db: {
          query: {
            toolApprovalPolicies: {
              findMany,
            },
          },
          transaction,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        requireApproval: false,
        toolName: "edit",
      },
    });

    expect(transaction).toHaveBeenCalled();
    expect(deleteToolApprovalPolicy).toHaveBeenCalled();
    expect(insertToolApprovalPolicy).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith({
      requireApproval: false,
      toolName: "edit",
      userId: "user-1",
    });
    expect(result.find((tool) => tool.toolName === "edit")).toMatchObject({
      isDefault: false,
      requireApproval: false,
      toolName: "edit",
    });
  });

  it("removes stored overrides when the default policy is restored", async () => {
    findMany.mockImplementationOnce(async () => []);

    const result = await approvalsRouter.update({
      ctx: {
        db: {
          query: {
            toolApprovalPolicies: {
              findMany,
            },
          },
          transaction,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        requireApproval: true,
        toolName: "edit",
      },
    });

    expect(transaction).toHaveBeenCalled();
    expect(deleteToolApprovalPolicy).toHaveBeenCalled();
    expect(insertToolApprovalPolicy).not.toHaveBeenCalled();
    expect(result.find((tool) => tool.toolName === "edit")).toMatchObject({
      isDefault: true,
      requireApproval: true,
      toolName: "edit",
    });
  });
});
