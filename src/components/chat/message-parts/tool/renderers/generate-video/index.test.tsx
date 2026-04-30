import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GenerateVideoTool } from ".";

const onApprove = mock(() => {});
const onDeny = mock(() => {});

describe("GenerateVideoTool", () => {
  it("renders approval actions when approval is requested", () => {
    const markup = renderToStaticMarkup(
      <GenerateVideoTool
        onApprove={onApprove}
        onDeny={onDeny}
        part={
          {
            approval: { id: "approval-1", reason: "Needs permission" },
            input: {
              mode: "single",
              prompt: "a drifting camera move through a flower shop",
            },
            state: "approval-requested",
            toolCallId: "tool-call-1",
            toolName: "generate_video",
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
      <GenerateVideoTool
        part={
          {
            input: {
              mode: "multi_model",
              prompt: "a cinematic drone shot over the ocean",
            },
            output: {
              failureCount: 1,
              mode: "multi_model",
              prompt: "a cinematic drone shot over the ocean",
              requestedCount: 1,
              successCount: 1,
              targets: [
                {
                  modelId: "veo-3.1-fast-generate-preview",
                  provider: "google_vertex",
                  providerMetadataSummary: null,
                  responseModelId: "veo-3.1-fast-generate-preview",
                  status: "success",
                  videos: [
                    {
                      artifactPath:
                        "user-1/thread-1/artifact-1/google_vertex.mp4",
                      mediaType: "video/mp4",
                    },
                  ],
                  warnings: [],
                },
                {
                  error: "Provider failed",
                  modelId: "grok-imagine-video",
                  provider: "xai",
                  status: "error",
                },
              ],
            },
            state: "output-available",
            toolCallId: "tool-call-2",
            toolName: "generate_video",
            type: "dynamic-tool",
          } as any
        }
      />,
    );

    expect(markup).toContain("Generated videos — 1 success · 1 failed");
    expect(markup).toContain(
      "/api/generated-media/user-1/thread-1/artifact-1/google_vertex.mp4",
    );
  });

  it("renders top-level output errors", () => {
    const markup = renderToStaticMarkup(
      <GenerateVideoTool
        part={
          {
            errorText: "Tool execution failed",
            input: {
              mode: "single",
              prompt: "broken",
            },
            state: "output-error",
            toolCallId: "tool-call-3",
            toolName: "generate_video",
            type: "dynamic-tool",
          } as any
        }
      />,
    );

    expect(markup).toContain("Video generation failed");
  });

  it("does not show approval actions when an approval-requested part already has an error", () => {
    const markup = renderToStaticMarkup(
      <GenerateVideoTool
        onApprove={onApprove}
        onDeny={onDeny}
        part={
          {
            approval: { id: "approval-4", reason: "Needs permission" },
            errorText:
              'Reference image attachment "placeholder.png" was not found.',
            input: {
              mode: "single",
              prompt: "a 5-second video of Socrates in Athens",
              referenceImageFilename: "placeholder.png",
            },
            state: "approval-requested",
            toolCallId: "tool-call-4",
            toolName: "generate_video",
            type: "dynamic-tool",
          } as any
        }
      />,
    );

    expect(markup).toContain("Video generation failed");
    expect(markup).not.toContain(
      "Reference image attachment &quot;placeholder.png&quot; was not found.",
    );
    expect(markup).not.toContain("Approve");
    expect(markup).not.toContain("Deny");
    expect(markup).not.toContain("Waiting for videos");
    expect(markup).not.toContain("Generate video");
  });
});
