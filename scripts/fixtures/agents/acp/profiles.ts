// Starting scenarios for the ACP agents P12/P13 integrate. They reproduce the
// wire traits recorded in the design and recon notes (t3code drivers, current
// Sentinel Cursor code); they are not recordings of the real agents, so engine
// tests should still assert on behaviour, not on these exact values.
import {
  STANDARD_PERMISSION_OPTIONS,
  selectConfigOption,
  type AcpMockScenario,
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

/**
 * Grok Build (`grok agent stdio`, ≥1.0.13): `xai.api_key` / `cached_token`
 * auth, legacy `models` with reasoning efforts in `_meta`, images accepted
 * despite `image:false`, and a turn that settles through
 * `x.ai/session/prompt_complete` while the prompt request never answers.
 * Prompts containing "rate" fail with the -32003 usage limit; "plan" runs
 * `x.ai/exit_plan_mode`; "ask" runs `x.ai/ask_user_question`.
 */
export function grokProfile(): AcpMockScenario {
  return {
    initialize: {
      agentInfo: { name: "grok", version: "1.0.50" },
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          image: false,
          audio: false,
          embeddedContext: true,
        },
        sessionCapabilities: { resume: {} },
      },
      authMethods: [
        {
          id: "xai.api_key",
          name: "xAI API key",
          type: "env_var",
          vars: [{ name: "XAI_API_KEY", label: "API key" }],
        },
        { id: "cached_token", name: "Cached login" },
      ],
    },
    session: {
      models: {
        currentModelId: "grok-build",
        availableModels: [
          { modelId: "grok-build", name: "Grok Build" },
          {
            modelId: "grok-4.5",
            name: "Grok 4.5",
            _meta: {
              reasoningEfforts: ["low", "medium", "high"],
              reasoningEffort: "medium",
            },
          },
        ],
      },
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
        match: "plan",
        steps: [
          {
            type: "extRequest",
            method: "x.ai/exit_plan_mode",
            params: {
              sessionId: "{{sessionId}}",
              toolCallId: "grok-plan-1",
              planContent: "# Plan\n\n- step",
            },
          },
        ],
      },
      {
        match: "ask",
        steps: [
          {
            type: "extRequest",
            method: "x.ai/ask_user_question",
            params: {
              sessionId: "{{sessionId}}",
              mode: "default",
              questions: [
                {
                  id: "q1",
                  question: "Which approach?",
                  options: [
                    { label: "Fast" },
                    { label: "Safe", description: "More tests" },
                  ],
                  multiSelect: false,
                },
              ],
            },
            branches: {
              accepted: [{ type: "text", text: "Going with the answer." }],
              cancelled: [{ type: "stop", stopReason: "cancelled" }],
            },
          },
        ],
      },
      {
        steps: [
          { type: "text", text: "Working on it." },
          {
            type: "update",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "background task finished" },
              _meta: { promptId: "task-completed-1" },
            },
          },
          {
            type: "extNotification",
            method: "x.ai/session/prompt_complete",
            params: {
              sessionId: "{{sessionId}}",
              promptId: "{{promptId}}",
              stopReason: "end_turn",
            },
          },
          // The real race: the prompt response may never come.
          { type: "hang" },
        ],
      },
    ],
    cancel: { stopReason: "cancelled" },
  };
}

/**
 * Google Antigravity (`agy_acp_server`): protocol version 2 with the v1-shaped
 * body, eager `oauth-personal` auth, the sign-in URL printed on stdout,
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
    auth: { requireAuth: true },
    faults: {
      startupStdout: [
        "Open the following link to authenticate the ACP server: https://accounts.google.com/o/oauth2/v2/auth?client_id=mock&redirect_uri=http%3A%2F%2F127.0.0.1%3A45123%2F&state=mock-state",
      ],
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
