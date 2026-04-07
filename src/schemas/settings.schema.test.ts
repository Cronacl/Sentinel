import { describe, expect, it } from "bun:test";

import {
  accessKeySecretKeyProviderConfigFormSchema,
  apiKeyProviderConfigFormSchema,
  apiTokenProviderConfigFormSchema,
} from "./settings.schema";

describe("provider config schemas", () => {
  it("accepts api-key providers", () => {
    expect(
      apiKeyProviderConfigFormSchema.parse({
        apiKey: "test-key",
        baseURL: "https://api.example.com/v1",
        isEnabled: true,
      }),
    ).toEqual({
      apiKey: "test-key",
      baseURL: "https://api.example.com/v1",
      isEnabled: true,
    });
  });

  it("accepts api-token providers", () => {
    expect(
      apiTokenProviderConfigFormSchema.parse({
        apiToken: "replicate-token",
        baseURL: "https://api.replicate.com/v1",
        isEnabled: false,
      }),
    ).toEqual({
      apiToken: "replicate-token",
      baseURL: "https://api.replicate.com/v1",
      isEnabled: false,
    });
  });

  it("accepts access-key and secret-key providers", () => {
    expect(
      accessKeySecretKeyProviderConfigFormSchema.parse({
        accessKey: "kling-access",
        baseURL: "https://api-singapore.klingai.com",
        isEnabled: true,
        secretKey: "kling-secret",
      }),
    ).toEqual({
      accessKey: "kling-access",
      baseURL: "https://api-singapore.klingai.com",
      isEnabled: true,
      secretKey: "kling-secret",
    });
  });
});
