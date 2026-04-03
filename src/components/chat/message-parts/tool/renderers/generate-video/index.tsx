"use client";

import { memo } from "react";
import { Button } from "@heroui/react";
import { Video } from "react-video-kit";

import { buildGeneratedMediaUrl } from "@/lib/generated-media-url";

import type { RendererProps } from "../../renderer";

type GenerateVideoInput = {
  count?: number;
  mode?: "single" | "multi_model";
  modelId?: string;
  prompt?: string;
  provider?: string;
  providers?: string[];
  referenceImageFilename?: string;
};

type GeneratedVideo = {
  artifactPath: string;
  mediaType: string;
};

type SuccessfulTarget = {
  modelId: string;
  provider: string;
  providerMetadataSummary: string | null;
  responseModelId: string | null;
  status: "success";
  videos: GeneratedVideo[];
  warnings: string[];
};

type FailedTarget = {
  error: string;
  modelId: string;
  provider: string;
  status: "error";
};

type GenerateVideoOutput = {
  failureCount: number;
  mode: "single" | "multi_model";
  prompt: string;
  requestedCount: number;
  successCount: number;
  targets: Array<SuccessfulTarget | FailedTarget>;
};

function isGenerateVideoInput(value: unknown): value is GenerateVideoInput {
  const candidate = value as GenerateVideoInput;
  return (
    !!candidate &&
    typeof candidate === "object" &&
    (candidate.prompt === undefined || typeof candidate.prompt === "string")
  );
}

function isGenerateVideoOutput(value: unknown): value is GenerateVideoOutput {
  const candidate = value as GenerateVideoOutput;
  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.failureCount === "number" &&
    typeof candidate.successCount === "number" &&
    typeof candidate.prompt === "string" &&
    typeof candidate.requestedCount === "number" &&
    Array.isArray(candidate.targets)
  );
}

type FlatVideo = {
  key: string;
  label: string;
  providerMeta: string;
  src: string;
};

function GeneratedVideoCard({ video }: { video: FlatVideo }) {
  return (
    <div className="overflow-hidden rounded-[1.45rem] border border-white/8 bg-black/70 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
      <Video.Root
        autoPlay={false}
        className="relative aspect-video w-full overflow-hidden rounded-[1.45rem]"
        subtitle={video.label}
        title={video.providerMeta}
        showControls
        src={video.src}
      >
        <Video.Media />
        <Video.Backdrop className="pointer-events-none" />

        <Video.Header>
          <div className="rv-w-full rv-flex">
            <Video.FullscreenToggle />
            <Video.PipToggle />
          </div>
          <div className="rv-w-full rv-flex rv-justify-end rv-items-center rv-h-fit">
            <Video.Volume.Button />
            <Video.Volume.Slider />
          </div>
        </Video.Header>

        <Video.Center>
          <Video.PlayPause />
          <Video.Loading />
        </Video.Center>
      </Video.Root>
    </div>
  );
}

function collectVideos(output: GenerateVideoOutput): FlatVideo[] {
  const videos: FlatVideo[] = [];
  for (const target of output.targets) {
    if (target.status !== "success") continue;
    for (let i = 0; i < target.videos.length; i++) {
      const video = target.videos[i];
      if (!video) continue;
      videos.push({
        key: `${target.provider}:${target.modelId}:${i}`,
        label: `Generated video ${videos.length + 1}`,
        providerMeta: `${target.provider}/${target.modelId}`,
        src: buildGeneratedMediaUrl(video.artifactPath),
      });
    }
  }
  return videos;
}

function VideoGrid({ output }: { output: GenerateVideoOutput }) {
  const videos = collectVideos(output);
  const failures = output.targets.filter(
    (target) => target.status === "error",
  ) as FailedTarget[];
  const warnings = output.targets.flatMap((target) =>
    target.status === "success"
      ? target.warnings.map((warning) => ({
          key: `${target.provider}:${target.modelId}:${warning}`,
          label: `${target.provider}/${target.modelId}`,
          warning,
        }))
      : [],
  );

  return (
    <>
      {videos.length > 0 ? (
        <div
          className={`grid gap-2 ${
            videos.length === 1 ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"
          }`}
        >
          {videos.map((video) => (
            <GeneratedVideoCard key={video.key} video={video} />
          ))}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mt-2 space-y-1">
          {warnings.map((warning) => (
            <p className="text-[11px] text-foreground/55" key={warning.key}>
              <span className="font-medium">{warning.label}</span>
              {" — "}
              {warning.warning}
            </p>
          ))}
        </div>
      ) : null}

      {failures.length > 0 ? (
        <div className="mt-2 space-y-1">
          {failures.map((target) => (
            <p
              className="text-[11px] text-danger-soft-foreground"
              key={`${target.provider}:${target.modelId}:error`}
            >
              <span className="font-medium">
                {target.provider}/{target.modelId}
              </span>
              {" — "}
              {target.error}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}

function buildSummaryText(
  part: RendererProps["part"],
  partErrorText: string | undefined,
  output: GenerateVideoOutput | null,
) {
  if (partErrorText) return "Video generation failed";
  if (part.state === "output-denied") return "Video generation denied";
  if (part.state === "output-error") return "Video generation failed";
  if (part.state === "approval-requested") return "Generate video";
  if (part.state === "output-available" && output) {
    const suffix =
      output.failureCount > 0 ? ` · ${output.failureCount} failed` : "";
    return `Generated videos — ${output.successCount} success${suffix}`;
  }
  return "Generating videos";
}

export const GenerateVideoTool = memo(function GenerateVideoTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const input =
    "input" in part && isGenerateVideoInput(part.input) ? part.input : null;
  const output =
    "output" in part && isGenerateVideoOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const hasBlockingError = Boolean(partErrorText) && !output;
  const showApprovalActions =
    part.state === "approval-requested" &&
    !hasBlockingError &&
    approvalId &&
    onApprove &&
    onDeny;
  const isRunningState = part.state === "approval-responded";
  const isFinishedState =
    hasBlockingError ||
    part.state === "output-denied" ||
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(output));
  const isErrorState =
    hasBlockingError ||
    part.state === "output-denied" ||
    part.state === "output-error" ||
    Boolean(output && output.successCount === 0);
  const isRunning =
    isRunningState || (!isFinishedState && part.state !== "approval-requested");

  if (!input) {
    return null;
  }

  return (
    <div>
      <p
        className={`text-[13px] ${
          isErrorState
            ? "text-danger"
            : isRunning
              ? "sentinel-thinking-shimmer"
              : "text-foreground/70"
        }`}
      >
        {buildSummaryText(part, partErrorText, output)}
      </p>

      {output ? (
        <div className="mt-2">
          <VideoGrid output={output} />
        </div>
      ) : !isFinishedState ? (
        <p className="mt-1 text-[11px] text-foreground/50">
          Waiting for videos...
        </p>
      ) : null}

      {showApprovalActions ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            className="h-7 min-w-0 px-3 text-[11px]"
            onPress={() => approvalId && onApprove?.(approvalId)}
            size="sm"
            type="button"
          >
            Approve
          </Button>
          <Button
            className="h-7 min-w-0 px-3 text-[11px]"
            onPress={() => approvalId && onDeny?.(approvalId)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Deny
          </Button>
        </div>
      ) : null}

      {partErrorText ? (
        <div className="mt-1 rounded-lg border border-danger/20 bg-danger-soft px-3 py-1.5 text-[11px] text-danger-soft-foreground">
          {partErrorText}
        </div>
      ) : null}
    </div>
  );
});
