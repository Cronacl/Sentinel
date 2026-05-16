type ClaudeMirrorToolState =
  | "approval-requested"
  | "approval-responded"
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getTextFromArrayContent(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const texts = value
    .filter(
      (item) =>
        isRecord(item) && item.type === "text" && typeof item.text === "string",
    )
    .map((item) => (item as Record<string, unknown>).text as string);

  return texts.length > 0 ? texts.join("\n") : null;
}

function getFallbackClaudeToolName(blockType: string | null) {
  if (
    blockType === "bash_code_execution_tool_result" ||
    blockType === "bash_code_execution_result"
  ) {
    return "claude_bash";
  }

  return "claude_runtime";
}

function getClaudeToolResultState(
  output: unknown,
  isExplicitError = false,
): Pick<
  ExtractClaudeToolResult,
  "errorText" | "output" | "state" | "toolName"
> {
  const normalized = isRecord(output) ? output : null;
  const blockType =
    typeof normalized?.type === "string" ? normalized.type : null;
  const isError =
    isExplicitError ||
    normalized?.isError === true ||
    typeof normalized?.error === "string" ||
    typeof normalized?.error_code === "string";

  return {
    ...(isError ? { errorText: JSON.stringify(output) } : {}),
    output,
    state: isError ? "output-error" : "output-available",
    toolName: getFallbackClaudeToolName(blockType),
  };
}

type ExtractClaudeToolResult = {
  errorText?: string;
  output: unknown;
  state: ClaudeMirrorToolState;
  toolCallId: string;
  toolName: string;
};

export function normalizeClaudeToolOutput(output: unknown): unknown {
  if (Array.isArray(output)) {
    const text = getTextFromArrayContent(output);
    if (text) {
      return { stdout: text };
    }

    return output;
  }

  if (!isRecord(output)) {
    return output;
  }

  const type = typeof output.type === "string" ? output.type : null;

  if (type?.endsWith("_tool_result") && "content" in output) {
    return normalizeClaudeToolOutput(output.content);
  }

  const structuredText = getTextFromArrayContent(output.structuredContent);
  const hasStdout =
    typeof output.stdout === "string" && output.stdout.length > 0;
  const hasStderr =
    typeof output.stderr === "string" && output.stderr.length > 0;
  const persistedOutputNote =
    !hasStdout &&
    !hasStderr &&
    typeof output.persistedOutputPath === "string" &&
    output.persistedOutputPath.length > 0
      ? `[Full output saved to ${output.persistedOutputPath}]`
      : !hasStdout &&
          !hasStderr &&
          typeof output.rawOutputPath === "string" &&
          output.rawOutputPath.length > 0
        ? `[Full output saved to ${output.rawOutputPath}]`
        : null;

  if (
    type === "bash_code_execution_result" ||
    "stdout" in output ||
    "stderr" in output ||
    "structuredContent" in output
  ) {
    return {
      ...output,
      ...(typeof output.return_code === "number"
        ? { exitCode: output.return_code }
        : {}),
      ...(!hasStdout && structuredText ? { stdout: structuredText } : {}),
      ...(!hasStdout && !structuredText && persistedOutputNote
        ? { stdout: persistedOutputNote }
        : {}),
    };
  }

  return output;
}

export function extractClaudeAssistantToolResultBlock(
  block: unknown,
): ExtractClaudeToolResult | null {
  if (!isRecord(block)) {
    return null;
  }

  const blockType = typeof block.type === "string" ? block.type : null;
  const toolCallId =
    typeof block.tool_use_id === "string" ? block.tool_use_id : null;

  if (!blockType?.endsWith("_tool_result") || !toolCallId) {
    return null;
  }

  const output = normalizeClaudeToolOutput(block);
  return {
    toolCallId,
    ...getClaudeToolResultState(output),
  };
}

export function extractClaudeUserToolResults(message: unknown) {
  const results: ExtractClaudeToolResult[] = [];

  if (isRecord(message)) {
    const parentToolUseId =
      typeof message.parent_tool_use_id === "string"
        ? message.parent_tool_use_id
        : null;
    if (parentToolUseId && "tool_use_result" in message) {
      const output = normalizeClaudeToolOutput(message.tool_use_result);
      results.push({
        toolCallId: parentToolUseId,
        ...getClaudeToolResultState(output),
      });
    }

    const messageParam = isRecord(message.message) ? message.message : null;
    const content = Array.isArray(messageParam?.content)
      ? messageParam.content
      : null;

    for (const block of content ?? []) {
      if (!isRecord(block) || block.type !== "tool_result") {
        continue;
      }

      const toolCallId =
        typeof block.tool_use_id === "string" ? block.tool_use_id : null;
      if (!toolCallId) {
        continue;
      }

      const output = normalizeClaudeToolOutput(
        "content" in block ? block.content : block,
      );
      results.push({
        toolCallId,
        ...getClaudeToolResultState(output, block.is_error === true),
      });
    }
  }

  return results;
}
