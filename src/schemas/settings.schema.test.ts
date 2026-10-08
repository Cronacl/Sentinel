import { describe, expect, it } from "bun:test";

import {
  accessKeySecretKeyProviderConfigFormSchema,
  apiKeyProviderConfigFormSchema,
  apiTokenProviderConfigFormSchema,
  ollamaProviderConfigFormSchema,
  providerConfigFormSchema,
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

  it("fills defaults for credentials a provider does not use", () => {
    expect(
      providerConfigFormSchema.parse({
        apiKey: " sk-test ",
        baseURL: "",
        isEnabled: true,
      }),
    ).toStrictEqual({
      accessKey: "",
      accessKeyId: "",
      apiKey: "sk-test",
      apiToken: "",
      baseURL: "",
      clientEmail: "",
      isEnabled: true,
      location: "",
      privateKey: "",
      project: "",
      region: "",
      secretAccessKey: "",
      secretKey: "",
    });
  });

  it("defaults the Ollama base URL", () => {
    expect(ollamaProviderConfigFormSchema.parse({ isEnabled: true })).toEqual({
      baseURL: "http://localhost:11434/v1",
      isEnabled: true,
    });
  });

  it("rejects malformed base URLs", () => {
    const result = apiKeyProviderConfigFormSchema.safeParse({
      apiKey: "test-key",
      baseURL: "not a url",
      isEnabled: true,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a valid URL.");
  });
});
