import { describe, expect, it } from "bun:test";

import {
  getConfiguredInternalToken,
  INTERNAL_TOKEN_HEADER,
  verifyInternalToken,
} from "./internal-token";

const TOKEN = "a".repeat(64);

function headers(value?: string) {
  return new Headers(
    value === undefined ? {} : { [INTERNAL_TOKEN_HEADER]: value },
  );
}

describe("internal route token", () => {
  it("reads a token of at least 32 characters from the environment", () => {
    expect(getConfiguredInternalToken({ SENTINEL_INTERNAL_TOKEN: TOKEN })).toBe(
      TOKEN,
    );
    expect(
      getConfiguredInternalToken({ SENTINEL_INTERNAL_TOKEN: "short" }),
    ).toBe(null);
    expect(getConfiguredInternalToken({})).toBe(null);
  });

  it("hides internal routes when no token is configured", () => {
    expect(verifyInternalToken(headers(TOKEN), null)).toEqual({
      allowed: false,
      status: 404,
    });
  });

  it("accepts only the configured token", () => {
    expect(verifyInternalToken(headers(TOKEN), TOKEN)).toEqual({
      allowed: true,
    });
    expect(verifyInternalToken(headers(`${TOKEN}x`), TOKEN)).toEqual({
      allowed: false,
      status: 403,
    });
    expect(verifyInternalToken(headers(""), TOKEN)).toEqual({
      allowed: false,
      status: 403,
    });
    expect(verifyInternalToken(headers(), TOKEN)).toEqual({
      allowed: false,
      status: 403,
    });
  });
});
