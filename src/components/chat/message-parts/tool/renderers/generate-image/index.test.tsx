import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GenerateImageTool } from ".";

const onApprove = mock(() => {});
const onDeny = mock(() => {});

describe("GenerateImageTool", () => {
  it("renders approval actions when approval is requested", () => {
    const markup = renderToStaticMarkup(
      <GenerateImageTool
        onApprove={onApprove}
        onDeny={onDeny}
        part={
          {
            approval: { id: "approval-1", reason: "Needs permission" },
            input: {
              mode: "single",
              prompt: "a fox in watercolor",
            },
            state: "approval-requested",
            toolCallId: "tool-call-1",
            toolName: "generate_image",
            type: "dynamic-tool",
          } as any
        }
      />,
    );

    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
  });

  it("renders mixed success and failure results", () => {
    const markup = renderToStaticMarkup(
      <GenerateImageTool
        part={
          {
            input: {
              mode: "multi_model",
              prompt: "cinematic skyline",
            },
            output: {
              failureCount: 1,
              mode: "multi_model",
              prompt: "cinematic skyline",
              requestedCount: 1,
              successCount: 1,
              targets: [
                {
                  images: [
                    {
                      dataUrl: "data:image/png;base64,aGVsbG8=",
                      mediaType: "image/png",
                    },
                  ],
                  modelId: "gpt-image-1",
                  provider: "openai",
                  providerMetadataSummary: null,
                  responseModelId: "gpt-image-1",
                  status: "success",
                  warnings: [],
                },
                {
                  error: "Provider failed",
                  modelId: "broken-model",
                  provider: "google",
                  status: "error",
                },
              ],
            },
            state: "output-available",
            toolCallId: "tool-call-2",
            toolName: "generate_image",
            type: "dynamic-tool",
          } as any
        }
      />,
    );

    expect(markup).toContain("Generated images — 1 success · 1 failed");
  });

  it("renders top-level output errors", () => {
    const markup = renderToStaticMarkup(
      <GenerateImageTool
        part={
          {
            errorText: "Tool execution failed",
            input: {
              mode: "single",
              prompt: "broken",
            },
            state: "output-error",
            toolCallId: "tool-call-3",
            toolName: "generate_image",
            type: "dynamic-tool",
          } as any
        }
      />,
    );

    expect(markup).toContain("Image generation failed");
  });
});
