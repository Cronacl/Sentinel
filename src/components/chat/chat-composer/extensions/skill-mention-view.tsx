"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { SkillIcon } from "@/components/skills/skill-icon";

export function SkillMentionView({ node }: NodeViewProps) {
  const name = String(node.attrs.name ?? "");
  const metadataIcon =
    typeof node.attrs.icon === "string" ? node.attrs.icon : null;

  return (
    <NodeViewWrapper
      as="span"
      className="sentinel-chip sentinel-chip--skill sentinel-chip--with-icon"
      data-skill-mention=""
    >
      <SkillIcon
        className="sentinel-chip-icon"
        metadataIcon={metadataIcon}
        name={name}
        size={11}
      />
      <span className="sentinel-chip-label">{name}</span>
    </NodeViewWrapper>
  );
}
