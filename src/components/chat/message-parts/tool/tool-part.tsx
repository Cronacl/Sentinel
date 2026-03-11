"use client";

import { memo } from "react";

import { resolveToolRenderer } from "./tool-registry";
import type { ToolRendererProps } from "./tool-renderer";
import { GenericToolPart } from "./generic-tool-part";

export const ToolPart = memo(function ToolPart(props: ToolRendererProps) {
  const Renderer = resolveToolRenderer(props.part);

  if (Renderer) {
    return <Renderer {...props} />;
  }

  return <GenericToolPart {...props} />;
});
