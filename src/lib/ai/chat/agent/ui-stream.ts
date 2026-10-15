import {
  convertToModelMessages,
  toUIMessageStream,
  validateUIMessages,
  type Agent,
  type GenerateTextOnStepEndCallback,
  type StreamTextTransform,
  type ToolSet,
  type UIMessage,
  type UIMessageStreamOptions,
} from "ai";

/**
 * Runs the thread agent and streams its output as UI message chunks.
 *
 * Same flow as `createAgentUIStream` from `ai`, except that the transcript is
 * only validated structurally. The thread agent builds its tools per call in
 * `prepareCall`, so `agent.tools` is empty here, and `createAgentUIStream`
 * would then reject pending `tool-*` parts (an `approval-responded` part after
 * the user answers an approval) and replace every earlier static tool output
 * with "Tool output omitted because the tool is no longer available." Without
 * tools, tool outputs reach the model as stored, as they did in AI SDK 6.0.116.
 */
export async function createThreadAgentUIStream<
  CALL_OPTIONS,
  UI_MESSAGE extends UIMessage,
>({
  abortSignal,
  agent,
  experimental_transform,
  onStepEnd,
  options,
  uiMessages,
  ...uiMessageStreamOptions
}: {
  abortSignal?: AbortSignal;
  agent: Agent<CALL_OPTIONS, ToolSet>;
  experimental_transform?: StreamTextTransform<ToolSet>;
  onStepEnd?: GenerateTextOnStepEndCallback<ToolSet>;
  options: CALL_OPTIONS;
  uiMessages: UI_MESSAGE[];
} & UIMessageStreamOptions<UI_MESSAGE>) {
  const validatedMessages = await validateUIMessages<UI_MESSAGE>({
    messages: uiMessages,
  });
  const modelMessages = await convertToModelMessages(validatedMessages);

  const result = await agent.stream({
    abortSignal,
    experimental_transform,
    onStepEnd,
    options,
    prompt: modelMessages,
  });

  return toUIMessageStream<ToolSet, UI_MESSAGE>({
    ...uiMessageStreamOptions,
    originalMessages:
      uiMessageStreamOptions.originalMessages ?? validatedMessages,
    stream: result.stream,
  });
}
