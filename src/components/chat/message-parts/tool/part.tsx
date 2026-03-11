"use client";

import { memo } from "react";

import { GenericTool } from "./generic";
import { resolveRenderer } from "./registry";
import type { RendererProps } from "./renderer";

export const ToolPart = memo(function ToolPart(props: RendererProps) {
  const Renderer = resolveRenderer(props.part);

  if (Renderer) {
    return <Renderer {...props} />;
  }

  return <GenericTool {...props} />;
});
