"use client";

import {
  Button,
  Description,
  Input,
  Label,
  Spinner,
  TextField,
} from "@heroui/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { CopyButton } from "@/components/chat/message-parts/shared/copy-button";
import {
  isEngineAuthFlowActive,
  type EngineAuthFlowState,
  type EngineAuthInteraction,
  type EngineAuthResponse,
  type EngineSnapshot,
} from "@/lib/ai/chat/engines/contract";
import {
  canRunDesktopTerminalCommands,
  getDesktopApi,
} from "@/lib/desktop/client";
import { getErrorMessage } from "@/lib/errors";
import { api } from "@/trpc/react";

import {
  emptyCredentialValues,
  findMissingCredential,
  getEngineAuthPanelView,
  getTerminalDisplayCommand,
} from "./engine-auth-helpers";
import { EngineAuthTerminal } from "./engine-auth-terminal";

// Sign in and out of one engine instance (Settings → Engines). The flow
// runs on the server (api.engines.auth); this panel shows its current step:
// a sign-in page to open, a device code, an embedded terminal (desktop) or
// a command to copy (browser), or a credentials form.

const ACTION_BUTTON = "h-6 min-w-0 px-2 text-[11px]";
const FLOW_POLL_MS = 1_000;

const noSubscription = () => () => {};

function useCanEmbedTerminal() {
  return useSyncExternalStore(
    noSubscription,
    canRunDesktopTerminalCommands,
    () => false,
  );
}

function openSignInPage(url: string) {
  const desktop = getDesktopApi();
  if (desktop) {
    void desktop.openExternal(url).catch(() => undefined);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function FlowMessage({ children }: { children: ReactNode }) {
  return <p className="text-muted text-[11px] leading-relaxed">{children}</p>;
}

function CredentialsForm({
  interaction,
  isPending,
  onCancel,
  onSubmit,
}: {
  interaction: Extract<EngineAuthInteraction, { type: "credentials" }>;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState(() =>
    emptyCredentialValues(interaction.fields),
  );
  const missing = findMissingCredential(interaction.fields, values);

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!missing) {
          onSubmit(values);
        }
      }}
    >
      {interaction.fields.map((field, index) => (
        <TextField
          autoFocus={index === 0}
          fullWidth
          key={field.name}
          name={field.name}
          onChange={(value) =>
            setValues((current) => ({ ...current, [field.name]: value }))
          }
          type={field.secret ? "password" : "text"}
          value={values[field.name] ?? ""}
        >
          <Label className="text-[11px]">{field.label}</Label>
          <Input autoComplete="off" spellCheck={false} variant="secondary" />
        </TextField>
      ))}
      {interaction.description ? (
        <Description className="text-[11px]">
          {interaction.description}
        </Description>
      ) : null}
      <div className="flex justify-end gap-1.5">
        <Button
          className={ACTION_BUTTON}
          onPress={onCancel}
          size="sm"
          variant="tertiary"
        >
          Cancel
        </Button>
        <Button
          className={ACTION_BUTTON}
          isDisabled={Boolean(missing)}
          isPending={isPending}
          size="sm"
          type="submit"
        >
          Save
        </Button>
      </div>
    </form>
  );
}

/** The running flow's current step (exported for tests). */
export function EngineAuthFlowStep({
  embedTerminal,
  isResponding,
  onCancel,
  onRespond,
  state,
}: {
  embedTerminal: boolean;
  isResponding: boolean;
  onCancel: () => void;
  onRespond: (response: EngineAuthResponse) => void;
  state: EngineAuthFlowState;
}) {
  const [terminalError, setTerminalError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  // The embedded command's exit, kept so it can be sent again when the
  // first answer did not reach the server.
  const [terminalExit, setTerminalExit] = useState<{
    exitCode: number;
    id: string;
  } | null>(null);
  const interaction = state.interaction;
  const cancelButton = (
    <Button
      className={ACTION_BUTTON}
      onPress={onCancel}
      size="sm"
      variant="tertiary"
    >
      Cancel
    </Button>
  );

  if (!interaction || state.phase !== "waiting") {
    return (
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <FlowMessage>{state.message ?? "Working…"}</FlowMessage>
        </div>
        {state.phase === "starting" ? cancelButton : null}
      </div>
    );
  }

  switch (interaction.type) {
    case "browser":
      return (
        <div className="mt-2 space-y-1.5">
          <FlowMessage>{state.message}</FlowMessage>
          <div className="flex items-center justify-end gap-1.5">
            <CopyButton text={interaction.url} title="Copy sign-in link" />
            {cancelButton}
            <Button
              className={ACTION_BUTTON}
              onPress={() => openSignInPage(interaction.url)}
              size="sm"
            >
              Open sign-in page
            </Button>
          </div>
        </div>
      );

    case "device-code":
      return (
        <div className="mt-2 space-y-1.5">
          <FlowMessage>{state.message}</FlowMessage>
          <div className="flex items-center gap-1.5">
            <code className="text-foreground font-mono text-sm tracking-widest">
              {interaction.userCode}
            </code>
            <CopyButton text={interaction.userCode} title="Copy code" />
          </div>
          <div className="flex justify-end gap-1.5">
            {cancelButton}
            <Button
              className={ACTION_BUTTON}
              onPress={() => openSignInPage(interaction.url)}
              size="sm"
            >
              Open sign-in page
            </Button>
          </div>
        </div>
      );

    case "terminal-command": {
      const failed =
        terminalError?.id === interaction.id ? terminalError.message : null;
      if (embedTerminal && interaction.launch && !failed) {
        const exit = terminalExit?.id === interaction.id ? terminalExit : null;
        return (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2">
              <FlowMessage>{state.message}</FlowMessage>
              <div className="flex gap-1.5">
                {cancelButton}
                {exit ? (
                  <Button
                    className={ACTION_BUTTON}
                    isPending={isResponding}
                    onPress={() =>
                      onRespond({ exitCode: exit.exitCode, type: "terminal" })
                    }
                    size="sm"
                  >
                    Check sign-in
                  </Button>
                ) : null}
              </div>
            </div>
            <EngineAuthTerminal
              interaction={interaction}
              onError={(message) =>
                setTerminalError({ id: interaction.id, message })
              }
              onExit={(exitCode) => {
                setTerminalExit({ exitCode, id: interaction.id });
                onRespond({ exitCode, type: "terminal" });
              }}
            />
          </div>
        );
      }

      const command = getTerminalDisplayCommand(interaction);
      return (
        <div className="mt-2 space-y-1.5">
          <FlowMessage>
            {failed
              ? `${failed} Run the command in a terminal instead, then confirm here.`
              : "Run this command in a terminal, then confirm here."}
          </FlowMessage>
          <div className="border-separator/30 bg-background flex items-start gap-1.5 rounded-lg border px-2 py-1.5">
            <code className="text-foreground min-w-0 flex-1 font-mono text-[11px] break-all">
              {command}
            </code>
            <CopyButton text={command} title="Copy command" />
          </div>
          <div className="flex justify-end gap-1.5">
            {cancelButton}
            <Button
              className={ACTION_BUTTON}
              isPending={isResponding}
              onPress={() => onRespond({ exitCode: null, type: "terminal" })}
              size="sm"
            >
              Done
            </Button>
          </div>
        </div>
      );
    }

    case "credentials":
      return (
        <CredentialsForm
          interaction={interaction}
          isPending={isResponding}
          key={interaction.id}
          onCancel={onCancel}
          onSubmit={(values) => onRespond({ type: "credentials", values })}
        />
      );
  }
}

/** Sign-in, sign-out and the running flow of one instance. */
export function EngineAuthPanel({ snapshot }: { snapshot: EngineSnapshot }) {
  const instanceId = snapshot.instanceId;
  const embedTerminal = useCanEmbedTerminal();
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const enabled = snapshot.availability === "available";

  const methodsQuery = api.engines.auth.methods.useQuery(
    { instanceId, terminal: embedTerminal },
    { enabled, staleTime: 60_000 },
  );
  const statusQuery = api.engines.auth.status.useQuery(
    { instanceId },
    {
      enabled,
      refetchInterval: (query) =>
        isEngineAuthFlowActive(query.state.data) ? FLOW_POLL_MS : false,
    },
  );
  const start = api.engines.auth.start.useMutation();
  const respond = api.engines.auth.respond.useMutation();
  const cancel = api.engines.auth.cancel.useMutation();
  const logout = api.engines.auth.logout.useMutation();

  const state = statusQuery.data ?? null;
  const showState = useCallback(
    (next: EngineAuthFlowState) => {
      utils.engines.auth.status.setData({ instanceId }, next);
    },
    [instanceId, utils.engines.auth.status],
  );

  const run = useCallback(
    async (task: () => Promise<EngineAuthFlowState>) => {
      setError(null);
      try {
        showState(await task());
      } catch (cause) {
        setError(getErrorMessage(cause, "Something went wrong. Try again."));
        void utils.engines.auth.status.invalidate({ instanceId });
      }
    },
    [instanceId, showState, utils.engines.auth.status],
  );

  // A finished flow changed what the instance can do: re-read everything
  // that depends on its sign-in (the server already re-probed it).
  const lastActiveFlow = useRef<string | null>(null);
  useEffect(() => {
    if (!state?.flowId) {
      return;
    }
    if (isEngineAuthFlowActive(state)) {
      lastActiveFlow.current = state.flowId;
      return;
    }
    if (lastActiveFlow.current === state.flowId) {
      lastActiveFlow.current = null;
      void Promise.all([
        utils.engines.snapshots.invalidate(),
        utils.engines.composerCatalog.invalidate(),
        utils.engines.models.invalidate(),
        utils.engines.auth.methods.invalidate({ instanceId }),
      ]);
    }
  }, [instanceId, state, utils.engines]);

  if (!enabled || methodsQuery.data?.supported === false) {
    return null;
  }

  const view = getEngineAuthPanelView({
    auth: snapshot.auth,
    canLogout: methodsQuery.data?.canLogout ?? false,
    installed: snapshot.install.installed,
    methods: methodsQuery.data?.methods ?? [],
    state,
  });
  const busy = start.isPending || logout.isPending;

  const handleCancel = () => {
    if (state?.flowId) {
      const flowId = state.flowId;
      void run(() => cancel.mutateAsync({ flowId, instanceId }));
    }
  };

  const handleRespond = (response: EngineAuthResponse) => {
    const interactionId = state?.interaction?.id;
    const flowId = state?.flowId;
    if (!interactionId || !flowId) {
      return;
    }
    void run(() =>
      respond.mutateAsync({ flowId, instanceId, interactionId, response }),
    );
  };

  return (
    <div className="border-separator/20 mt-2 border-t pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted text-[11px]">Sign-in</span>
        {view.active ? null : (
          <div className="flex flex-wrap justify-end gap-1.5">
            {methodsQuery.isPending ? <Spinner size="sm" /> : null}
            {confirmingSignOut ? (
              <>
                <span className="text-muted self-center text-[11px]">
                  Sign out of {snapshot.label}?
                </span>
                <Button
                  className={ACTION_BUTTON}
                  onPress={() => setConfirmingSignOut(false)}
                  size="sm"
                  variant="tertiary"
                >
                  Keep
                </Button>
                <Button
                  className={ACTION_BUTTON}
                  isPending={logout.isPending}
                  onPress={() => {
                    setConfirmingSignOut(false);
                    void run(() =>
                      logout.mutateAsync({
                        instanceId,
                        terminal: embedTerminal,
                      }),
                    );
                  }}
                  size="sm"
                  variant="danger"
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                {view.signInMethods.map((method) => (
                  <Button
                    aria-label={method.description ?? method.label}
                    className={ACTION_BUTTON}
                    isDisabled={busy}
                    key={method.id}
                    onPress={() =>
                      void run(() =>
                        start.mutateAsync({
                          instanceId,
                          methodId: method.id,
                          terminal: embedTerminal,
                        }),
                      )
                    }
                    size="sm"
                    variant="secondary"
                  >
                    {method.label}
                  </Button>
                ))}
                {view.showSignOut ? (
                  <Button
                    className={ACTION_BUTTON}
                    isDisabled={busy}
                    onPress={() => setConfirmingSignOut(true)}
                    size="sm"
                    variant="tertiary"
                  >
                    Sign out
                  </Button>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>

      {confirmingSignOut && methodsQuery.data?.logoutNotice ? (
        <p className="border-warning/20 bg-warning-soft text-warning-soft-foreground mt-1.5 rounded-lg border px-2 py-1 text-[11px]">
          {methodsQuery.data.logoutNotice}
        </p>
      ) : null}

      {view.active && state ? (
        <EngineAuthFlowStep
          embedTerminal={embedTerminal}
          isResponding={respond.isPending}
          key={state.flowId ?? "flow"}
          onCancel={handleCancel}
          onRespond={handleRespond}
          state={state}
        />
      ) : null}

      {!view.active &&
      view.signInMethods.length === 0 &&
      !methodsQuery.isPending &&
      !view.outcome ? (
        <p className="text-muted mt-1 text-[11px]">
          Install {snapshot.label} to sign in from here.
        </p>
      ) : null}

      {view.outcome ? (
        <p
          className={`mt-1.5 text-[11px] ${
            view.outcome.tone === "success"
              ? "text-success"
              : view.outcome.tone === "danger"
                ? "text-danger"
                : "text-muted"
          }`}
        >
          {view.outcome.message}
        </p>
      ) : null}

      {error ? <p className="text-danger mt-1.5 text-[11px]">{error}</p> : null}
    </div>
  );
}
