"use client";

import { memo, useState } from "react";
import { Button } from "@heroui/react";

import { ImagePreviewModal } from "@/components/chat/image-preview-modal";

import type { RendererProps } from "../../renderer";

type GenerateImageInput = {
  count?: number;
  mode?: "single" | "multi_model";
  modelId?: string;
  prompt?: string;
  provider?: string;
  providers?: string[];
};

type GeneratedImage = {
  dataUrl: string;
  mediaType: string;
};

type SuccessfulTarget = {
  images: GeneratedImage[];
  modelId: string;
  provider: string;
  providerMetadataSummary: string | null;
  responseModelId: string | null;
  status: "success";
  warnings: string[];
};

type FailedTarget = {
  error: string;
  modelId: string;
  provider: string;
  status: "error";
};

type GenerateImageOutput = {
  failureCount: number;
  mode: "single" | "multi_model";
  prompt: string;
  requestedCount: number;
  successCount: number;
  targets: Array<SuccessfulTarget | FailedTarget>;
};

function isGenerateImageInput(value: unknown): value is GenerateImageInput {
  const candidate = value as GenerateImageInput;
  return (
    !!candidate &&
    typeof candidate === "object" &&
    (candidate.prompt === undefined || typeof candidate.prompt === "string")
  );
}

function isGenerateImageOutput(value: unknown): value is GenerateImageOutput {
  const candidate = value as GenerateImageOutput;
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

type FlatImage = {
  alt: string;
  key: string;
  src: string;
};

function collectImages(output: GenerateImageOutput): FlatImage[] {
  const images: FlatImage[] = [];
  for (const target of output.targets) {
    if (target.status !== "success") continue;
    for (let i = 0; i < target.images.length; i++) {
      images.push({
        alt: `Generated image ${images.length + 1}`,
        key: `${target.provider}:${target.modelId}:${i}`,
        src: target.images[i]!.dataUrl,
      });
    }
  }
  return images;
}

function ImageGrid({ output }: { output: GenerateImageOutput }) {
  const [previewImage, setPreviewImage] = useState<FlatImage | null>(null);
  const images = collectImages(output);
  const failures = output.targets.filter(
    (t) => t.status === "error",
  ) as FailedTarget[];

  return (
    <>
      {images.length > 0 ? (
        <div
          className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}
        >
          {images.map((image) => (
            <button
              className="group relative aspect-square w-[9.5rem] overflow-hidden rounded-[1.45rem] bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-[10.5rem]"
              key={image.key}
              onClick={() => setPreviewImage(image)}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={image.alt}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                src={image.src}
              />
            </button>
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

      {previewImage ? (
        <ImagePreviewModal
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
          src={previewImage.src}
        />
      ) : null}
    </>
  );
}

function buildSummaryText(
  part: RendererProps["part"],
  input: GenerateImageInput,
  output: GenerateImageOutput | null,
) {
  if (part.state === "output-denied") return "Image generation denied";
  if (part.state === "output-error") return "Image generation failed";
  if (part.state === "approval-requested") return "Generate image";
  if (part.state === "output-available" && output) {
    const suffix =
      output.failureCount > 0 ? ` · ${output.failureCount} failed` : "";
    return `Generated images — ${output.successCount} success${suffix}`;
  }
  return "Generating images";
}

export const GenerateImageTool = memo(function GenerateImageTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const input =
    "input" in part && isGenerateImageInput(part.input) ? part.input : null;
  const output =
    "output" in part && isGenerateImageOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;
  const isRunningState = part.state === "approval-responded";
  const isFinishedState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(output));
  const isErrorState =
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
        {buildSummaryText(part, input, output)}
      </p>

      {output ? (
        <div className="mt-2">
          <ImageGrid output={output} />
        </div>
      ) : partErrorText ? (
        <p className="mt-1 text-[11px] text-danger-soft-foreground">
          {partErrorText}
        </p>
      ) : !isFinishedState ? (
        <p className="mt-1 text-[11px] text-foreground/50">
          Waiting for images...
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

      {partErrorText && part.state !== "output-error" ? (
        <div className="mt-1 rounded-lg border border-danger/20 bg-danger-soft px-3 py-1.5 text-[11px] text-danger-soft-foreground">
          {partErrorText}
        </div>
      ) : null}
    </div>
  );
});
