import { describe, expect, it } from "bun:test";

import { isSensitiveTrpcOperation } from "./sensitive-operations";

describe("isSensitiveTrpcOperation", () => {
  it("covers operations that carry credentials", () => {
    expect(isSensitiveTrpcOperation("engines.auth.respond")).toBe(true);
    expect(isSensitiveTrpcOperation("engines.auth.status")).toBe(true);
    expect(isSensitiveTrpcOperation("engines.codex.login")).toBe(true);
    expect(isSensitiveTrpcOperation("engines.instances.update")).toBe(true);
    expect(isSensitiveTrpcOperation("engines.snapshots")).toBe(false);
    expect(isSensitiveTrpcOperation("")).toBe(false);
  });
});
