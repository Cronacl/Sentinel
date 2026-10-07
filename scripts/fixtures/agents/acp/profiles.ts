// Starting scenarios for the ACP agents P12/P13 integrate. They reproduce the
// wire traits recorded in the design and recon notes (t3code drivers, current
// Sentinel Cursor code) and, for Grok, t3code's recordings of the real CLI.
// They are still scripts, not replays, so engine tests should assert on
// behaviour, not on these exact values.
import {
  STANDARD_PERMISSION_OPTIONS,
  selectConfigOption,
  type AcpLegacyModelState,
  type AcpMockScenario,
  type AcpMockStep,
} from "./scenario";

const cursorModes = {
  currentModeId: "agent",
  availableModes: [
    { id: "agent", name: "Agent" },
    { id: "plan", name: "Plan" },
    { id: "ask", name: "Ask" },
  ],
};

function cursorOptions(model: string, effort?: string) {
  return [
    selectConfigOption({
      id: "mode",
      name: "Mode",
      category: "mode",
      currentValue: "agent",
      values: ["agent", "plan", "ask"],
    }),
    selectConfigOption({
      id: "model",
      name: "Model",
      category: "model",
      currentValue: model,
      values: [
        { value: "default", name: "Auto" },
        { value: "composer-2", name: "Composer 2" },
        { value: "gpt-5.4", name: "GPT-5.4" },
      ],
    }),
    ...(effort
      ? [
          selectConfigOption({
            id: "reasoning",
            name: "Reasoning",
            category: "thought_level",
            currentValue: effort,
            values: ["none", "low", "medium", "high", "extra-high"],
          }),
        ]
      : []),
  ];
}

/**
 * Cursor `agent acp`: lazy `cursor_login`, mode and model config options whose
 * effort list depends on the model, and the `cursor/*` extension methods.
 * Prompts containing "plan" or "question" run the extension scripts.
 */
export function cursorProfile(): AcpMockScenario {
  return {
    initialize: {
      agentInfo: { name: "cursor-agent", version: "2026.08.04" },
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          image: true,
          audio: false,
          embeddedContext: false,
        },
        mcpCapabilities: { http: true, sse: true },
      },
      authMethods: [
        {
          id: "cursor_login",
          name: "Cursor Login",
          description: "Log in with Cursor",
        },
      ],
    },
    auth: { requireAuth: true, acceptMethodIds: ["cursor_login"] },
    session: {
      modes: cursorModes,
      configOptions: cursorOptions("default"),
      configOptionsAfterSet: {
        "model=gpt-5.4": cursorOptions("gpt-5.4", "medium"),
      },
      afterNew: [
        {
          sessionUpdate: "available_commands_update",
          availableCommands: [
            { name: "review", description: "Review changes" },
          ],
        },
      ],
    },
    prompts: [
      {
        match: "plan",
        steps: [
          {
            type: "extRequest",
            method: "cursor/create_plan",
            params: {
              toolCallId: "cursor-plan-1",
              name: "Refactor",
              overview: "Split the module",
              plan: "# Plan\n\n1. Split\n2. Test",
              todos: [{ content: "Split" }, { content: "Test" }],
            },
          },
          {
            type: "extNotification",
            method: "cursor/update_todos",
            params: {
              toolCallId: "cursor-todos-1",
              todos: [
                { content: "Split", status: "in_progress" },
                { content: "Test", status: "pending" },
              ],
            },
          },
        ],
      },
      {
        match: "question",
        steps: [
          {
            type: "extRequest",
            method: "cursor/ask_question",
            params: {
              toolCallId: "cursor-question-1",
              title: "Setup",
              questions: [
                {
                  id: "db",
                  prompt: "Which database?",
                  options: [
                    { id: "pg", label: "Postgres" },
                    { id: "sqlite", label: "SQLite" },
                  ],
                },
                {
                  id: "extras",
                  prompt: "Extras?",
                  allowMultiple: true,
                  options: [
                    { id: "auth", label: "Auth" },
                    { id: "cache", label: "Cache" },
                  ],
                },
              ],
            },
            echo: true,
          },
        ],
      },
      {
        steps: [
          { type: "thought", text: "Looking at the file." },
          {
            type: "toolCall",
            toolCallId: "cursor-read-1",
            title: "Read file",
            kind: "read",
            status: "pending",
            locations: [{ path: "{{cwd}}/README.md" }],
          },
          {
            type: "toolCallUpdate",
            toolCallId: "cursor-read-1",
            status: "completed",
          },
          {
            type: "toolCall",
            toolCallId: "cursor-edit-1",
            title: "Edit README.md",
            kind: "edit",
            status: "pending",
            content: [
              {
                type: "diff",
                path: "{{cwd}}/README.md",
                oldText: "old",
                newText: "new",
              },
            ],
          },
          {
            type: "requestPermission",
            toolCall: {
              toolCallId: "cursor-edit-1",
              title: "Edit README.md",
              kind: "edit",
            },
            options: [
              { optionId: "allow-once", name: "Allow", kind: "allow_once" },
              {
                optionId: "allow-always",
                name: "Always allow",
                kind: "allow_always",
              },
              { optionId: "reject-once", name: "Reject", kind: "reject_once" },
            ],
            branches: {
              "reject-once": [
                {
                  type: "toolCallUpdate",
                  toolCallId: "cursor-edit-1",
                  status: "failed",
                },
              ],
              "*": [
                {
                  type: "toolCallUpdate",
                  toolCallId: "cursor-edit-1",
                  status: "completed",
                },
              ],
            },
          },
          { type: "text", text: "Done." },
        ],
      },
    ],
  };
}

const grokEfforts = [
  {
    id: "xhigh",
    value: "xhigh",
    label: "Extra High",
    description: "Maximum reasoning for the hardest tasks.",
    default: false,
  },
  {
    id: "high",
    value: "high",
    label: "High",
    description: "Thorough reasoning and quality. Recommended.",
    default: true,
  },
  {
    id: "medium",
    value: "medium",
    label: "Medium",
    description: "Strong quality with a faster turnaround.",
    default: false,
  },
  {
    id: "low",
    value: "low",
    label: "Low",
    description: "Fastest responses. Best for simple tasks.",
    default: false,
  },
];

function grokModel(
  modelId: string,
  name: string,
  efforts: typeof grokEfforts,
  description?: string,
): AcpLegacyModelState["availableModels"][number] {
  return {
    modelId,
    name,
    ...(description ? { description } : {}),
    _meta: {
      totalContextTokens: 500000,
      agentType: "grok-build-plan",
      supportsReasoningEffort: true,
      reasoningEffort: "high",
      reasoningEfforts: efforts,
    },
  };
}

const grokModelState: AcpLegacyModelState = {
  currentModelId: "grok-4.7",
  availableModels: [
    grokModel(
      "grok-4.7",
      "Grok 4.7",
      grokEfforts,
      "SpaceXAI's latest frontier model",
    ),
    grokModel(
      "grok-4.7-build-fast",
      "Grok 4.7 Fast",
      grokEfforts,
      "Fast variant. 2x the price.",
    ),
    // The recording lists three efforts for the older model.
    grokModel("grok-4.5", "Grok 4.5", grokEfforts.slice(1)),
  ],
};

/**
 * Grok Build (`grok agent stdio`), modelled on t3code's recordings of the
 * released 1.0.41 CLI (apps/server/src/orchestration-v2/testkit/fixtures/
 * {simple,plan_questions,grok_background_bash}/grok_transcript.ndjson, MIT).
 *
 * - Extension methods carry the leading underscore (`_x.ai/...`). Pass
 *   `{methodPrefix: ""}` for the canonical `x.ai/...` names that unreleased
 *   source builds send; t3code accepts both.
 * - `initialize` has no `agentInfo`; the model picker state is in
 *   `_meta.modelState`, with `reasoningEfforts` as objects.
 * - `session/new` answers legacy `models` plus `model` / `reasoning_effort`
 *   config options.
 * - Every turn frame carries params-level `_meta.promptId` (the client's
 *   `_meta.promptId`). The turn ends with `_x.ai/session_notification`
 *   `turn_completed`, `_x.ai/session/prompt_complete`, then the prompt
 *   response.
 *
 * Prompts containing "rate" fail with the -32003 usage limit, "plan" runs
 * `_x.ai/exit_plan_mode`, "ask" runs `_x.ai/ask_user_question`,
 * "background" ends the turn and then runs a background-task wake turn
 * tagged `task-completed-*`, and "race" settles through `prompt_complete`
 * while the prompt request never answers (the race t3code guards against).
 */
export function grokProfile(
  options: { methodPrefix?: "_" | "" } = {},
): AcpMockScenario {
  const prefix = options.methodPrefix ?? "_";
  const x = (name: string) => `${prefix}x.ai/${name}`;
  const turnMeta = (updateType: string) => ({
    promptId: "{{promptId}}",
    updateType,
  });
  const turnEnd = (promptId: string): AcpMockStep[] => [
    {
      type: "extNotification",
      method: x("session_notification"),
      params: {
        sessionId: "{{sessionId}}",
        update: {
          sessionUpdate: "turn_completed",
          prompt_id: promptId,
          stop_reason: "end_turn",
        },
      },
    },
    {
      type: "extNotification",
      method: x("queue/changed"),
      params: { sessionId: "{{sessionId}}", entries: [] },
    },
  ];
  const promptComplete: AcpMockStep = {
    type: "extNotification",
    method: x("session/prompt_complete"),
    params: {
      sessionId: "{{sessionId}}",
      promptId: "{{promptId}}",
      stopReason: "end_turn",
      agentResult: null,
    },
  };
  const responseMeta = {
    sessionId: "{{sessionId}}",
    requestId: "{{requestId}}",
    promptId: "{{promptId}}",
    modelId: "grok-4.7",
  };
  const working: AcpMockStep[] = [
    {
      type: "extNotification",
      method: x("queue/changed"),
      params: {
        sessionId: "{{sessionId}}",
        entries: [],
        runningPromptId: "{{promptId}}",
        runningKind: "prompt",
      },
    },
    {
      type: "thought",
      text: "The user wants a short answer.",
      notificationMeta: turnMeta("AgentThoughtChunk"),
    },
    {
      type: "text",
      text: "Working on it.",
      notificationMeta: turnMeta("AgentMessageChunk"),
    },
  ];
  const wakeId = "task-completed-00000000-0000-4000-8000-000000000002";
  const wakeMeta = (updateType: string) => ({
    promptId: wakeId,
    updateType,
  });

  return {
    initialize: {
      response: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: {
            image: false,
            audio: false,
            embeddedContext: true,
          },
          mcpCapabilities: { http: true, sse: true },
          sessionCapabilities: { list: {}, resume: {}, close: {} },
          auth: {},
        },
        authMethods: [
          {
            id: "cached_token",
            name: "cached_token",
            description: "Cached token from ~/.grok/auth.json",
          },
          { id: "grok.com", name: "Grok", description: "Sign in with Grok" },
        ],
        _meta: {
          defaultAuthMethodId: "cached_token",
          agentVersion: "1.0.41",
          modelState: grokModelState,
        },
      },
    },
    session: {
      models: grokModelState,
      configOptions: [
        selectConfigOption({
          id: "model",
          name: "Model",
          category: "model",
          currentValue: "grok-4.7",
          values: grokModelState.availableModels.map((model) => ({
            value: model.modelId,
            name: model.name,
          })),
        }),
        selectConfigOption({
          id: "reasoning_effort",
          name: "Reasoning Effort",
          category: "thought_level",
          currentValue: "high",
          values: grokEfforts.map((effort) => ({
            value: effort.value,
            name: effort.label,
            description: effort.description,
          })),
        }),
      ],
      afterNew: [
        {
          sessionUpdate: "available_commands_update",
          availableCommands: [
            {
              name: "compact",
              description:
                "Compress conversation history to save context window",
              input: { hint: "optional context about what to preserve" },
            },
            {
              name: "always-approve",
              description:
                "Toggle always-approve mode (skip all permission prompts)",
              input: { hint: "on|off" },
            },
          ],
        },
      ],
    },
    prompts: [
      {
        match: "rate",
        steps: [
          {
            type: "fail",
            error: {
              code: -32003,
              message: "Rate limit exceeded",
              data: { retryAfterSeconds: 60 },
            },
          },
        ],
      },
      {
        // No recording has exit_plan_mode on the wire; the wrapped params
        // follow the recorded ask_user_question frame and t3code's schema.
        match: "plan",
        steps: [
          {
            type: "extRequest",
            method: x("exit_plan_mode"),
            params: {
              method: "x.ai/exit_plan_mode",
              params: {
                sessionId: "{{sessionId}}",
                toolCallId: "exit-plan-mode-tool-call-1",
                planContent: "# Plan\n\n- step",
              },
            },
          },
          ...turnEnd("{{promptId}}"),
          promptComplete,
        ],
        meta: responseMeta,
      },
      {
        match: "ask",
        steps: [
          {
            type: "extRequest",
            method: x("ask_user_question"),
            params: {
              method: "x.ai/ask_user_question",
              params: {
                sessionId: "{{sessionId}}",
                toolCallId: "ask-user-question-tool-call-1",
                questions: [
                  {
                    id: "approach",
                    question: "Which approach?",
                    multiSelect: null,
                    options: [
                      { label: "Fast", description: "Ship it today." },
                      { label: "Safe", description: "More tests." },
                    ],
                  },
                ],
                mode: "plan",
              },
            },
            branches: {
              accepted: [
                {
                  type: "text",
                  text: "Going with the answer.",
                  notificationMeta: turnMeta("AgentMessageChunk"),
                },
              ],
              cancelled: [{ type: "stop", stopReason: "cancelled" }],
            },
          },
          ...turnEnd("{{promptId}}"),
          promptComplete,
        ],
        meta: responseMeta,
      },
      {
        match: "background",
        steps: [...working, ...turnEnd("{{promptId}}"), promptComplete],
        meta: responseMeta,
        // The wake turn arrives after the user turn ended; it never sends
        // prompt_complete.
        afterResponse: [
          {
            type: "extNotification",
            method: x("task_completed"),
            params: {
              sessionId: "{{sessionId}}",
              update: {
                sessionUpdate: "task_completed",
                task_snapshot: {
                  task_id: "00000000-0000-4000-8000-000000000002",
                  command: "for i in 1 2 3; do sleep 8; echo tock $i; done",
                },
              },
            },
          },
          {
            type: "thought",
            text: "The background task finished.",
            notificationMeta: wakeMeta("AgentThoughtChunk"),
          },
          {
            type: "text",
            text: "tock 3",
            notificationMeta: wakeMeta("AgentMessageChunk"),
          },
          ...turnEnd(wakeId),
        ],
      },
      {
        match: "race",
        steps: [
          ...working,
          ...turnEnd("{{promptId}}"),
          promptComplete,
          { type: "hang" },
        ],
      },
      {
        steps: [...working, ...turnEnd("{{promptId}}"), promptComplete],
        meta: responseMeta,
      },
    ],
    cancel: { stopReason: "cancelled" },
  };
}

/**
 * Google Antigravity (`agy_acp_server`): protocol version 2 with the v1-shaped
 * body, eager `oauth-personal` auth that prints the Google sign-in URL on
 * stdout and waits for the OAuth redirect on its loopback listener,
 * `session/resume`, permission modes as session modes, the thinking level in
 * the model id, `interaction_` permission requests that are questions, and
 * client fs reads.
 */
export function antigravityProfile(): AcpMockScenario {
  return {
    initialize: {
      protocolVersion: 2,
      agentInfo: { name: "antigravity-acp", version: "1.3.0" },
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { image: true, audio: true, embeddedContext: true },
        sessionCapabilities: { resume: {}, list: {}, close: {} },
        auth: { logout: {} },
      },
      authMethods: [
        { id: "oauth-personal", name: "Google account" },
        { id: "oauth-business", name: "Gemini Enterprise" },
        { id: "gemini-api-key", name: "Gemini API key" },
        { id: "agent-platform", name: "Vertex AI" },
      ],
    },
    auth: {
      requireAuth: true,
      browserLogin: {
        methodIds: ["oauth-personal", "oauth-business"],
        stdoutLines: [
          "Open the following link to authenticate the ACP server: https://accounts.google.com/o/oauth2/v2/auth?client_id=mock&redirect_uri={{callbackUrlEncoded}}&response_type=code&scope=openid&state=mock-state",
        ],
      },
    },
    session: {
      modes: {
        currentModeId: "default",
        availableModes: [
          { id: "default", name: "Default" },
          { id: "auto_edit", name: "Auto edit" },
          { id: "yolo", name: "YOLO" },
        ],
      },
      configOptions: [
        selectConfigOption({
          id: "model",
          name: "Model",
          category: "model",
          currentValue: "gemini-3.8-flash-medium",
          values: [
            "gemini-3.8-flash-high",
            "gemini-3.8-flash-medium",
            "gemini-3.8-flash-low",
          ],
        }),
      ],
    },
    prompts: [
      {
        steps: [
          {
            type: "clientFs",
            op: "read",
            path: "{{cwd}}/README.md",
            echo: true,
          },
          {
            type: "requestPermission",
            toolCall: {
              toolCallId: "interaction_1",
              title: "Which branch should I use?",
            },
            options: [
              { optionId: "main", name: "main", kind: "allow_once" },
              { optionId: "dev", name: "dev", kind: "allow_once" },
            ],
          },
          {
            type: "requestPermission",
            toolCall: {
              toolCallId: "edit-1",
              title: "Write README.md",
              kind: "edit",
            },
            options: STANDARD_PERMISSION_OPTIONS.slice(0, 3),
            meta: {
              "agy.security.warning":
                "Allows edits for the rest of this thread.",
            },
          },
          { type: "text", text: "Done." },
        ],
      },
    ],
    cancel: { stopReason: "cancelled" },
  };
}

/**
 * Devin (ACP registry `devin`): Cognition `_meta` on updates (streaming
 * message ids, subagent context and lifecycle, inferred tool names) and
 * commands run through client terminals.
 */
export function devinProfile(): AcpMockScenario {
  return {
    initialize: {
      agentInfo: { name: "devin", version: "3000.11.3" },
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          image: true,
          audio: false,
          embeddedContext: true,
        },
        sessionCapabilities: { list: {} },
      },
      authMethods: [{ id: "devin-login", name: "Devin login" }],
    },
    prompts: [
      {
        steps: [
          {
            type: "text",
            text: "Planning. ",
            meta: { "cognition.ai/streamingMessageId": "devin-msg-1" },
          },
          {
            type: "toolCall",
            toolCallId: "devin-sub-1",
            title: "Tool",
            kind: "other",
            status: "in_progress",
            meta: {
              "cognition.ai/inferenceToolName": "spawn_subagent",
              "cognition.ai/subagent_started": {
                agentId: "sub-1",
                task: "Write tests",
                title: "Tests",
                model: "swe-1",
              },
            },
          },
          {
            type: "update",
            sessionId: "sub-1",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "subagent output" },
              _meta: {
                "cognition.ai/subagent_context": {
                  parentAgentId: "{{sessionId}}",
                },
              },
            },
          },
          {
            type: "toolCallUpdate",
            toolCallId: "devin-sub-1",
            status: "completed",
            meta: {
              "cognition.ai/subagent_completed": {
                agentId: "sub-1",
                success: true,
                summary: "Added tests",
              },
            },
          },
          {
            type: "toolCall",
            toolCallId: "devin-exec-1",
            title: "Run tests",
            kind: "execute",
            status: "in_progress",
          },
          {
            type: "clientTerminal",
            command: "bun",
            args: ["test"],
            cwd: "{{cwd}}",
            toolCallId: "devin-exec-1",
          },
          {
            type: "toolCallUpdate",
            toolCallId: "devin-exec-1",
            status: "completed",
          },
          {
            type: "text",
            text: "All green.",
            meta: { "cognition.ai/streamingMessageId": "devin-msg-2" },
          },
        ],
      },
    ],
  };
}
