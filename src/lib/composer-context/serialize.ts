import type { ComposerContext } from "./types";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function serializeComposerContextToText(ctx: ComposerContext): string {
  const lines: string[] = [];

  if (ctx.paths.length > 0) {
    lines.push("<referenced-paths>");
    for (const entry of ctx.paths) {
      lines.push(
        `  <path kind="${entry.kind}">${escapeXml(entry.absolutePath)}</path>`,
      );
    }
    lines.push("</referenced-paths>");
  }

  if (ctx.skills.length > 0) {
    lines.push("<referenced-skills>");
    for (const entry of ctx.skills) {
      lines.push(`  <skill name="${escapeXml(entry.name)}" />`);
    }
    lines.push("</referenced-skills>");
  }

  return lines.join("\n");
}
