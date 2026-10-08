import "server-only";

import type {
  CodexAppServerManager,
  CodexNotificationEvent,
} from "@/lib/ai/chat/engines/codex-app-server";

import type { ResolvedEngineInstance } from "../../contract";
import {
  EngineAuthError,
  type EngineAuthController,
} from "../../platform/auth/controller";
import { API_KEY_METHOD_ID } from "./shared";

// Codex signs in through its app-server (account/login/start): ChatGPT in
// the browser (Codex runs the local callback itself), a device code, or an
// OpenAI API key that Codex stores in its own home. Completion arrives as an
// account/login/completed notification; cancelling a flow cancels the
// login (account/login/cancel). These are the same app-server calls as the
// api.engines.codex login procedures, now driven by the flow store.

export const CODEX_CHATGPT_METHOD_ID = "chatgpt";
export const CODEX_DEVICE_CODE_METHOD_ID = "chatgpt-device-code";

type CodexLoginManager = Pick<
  CodexAppServerManager,
  "cancelLogin" | "logout" | "startLogin" | "subscribeNotifications"
>;

type LoginCompletedParams = {
  error?: string | null;
  loginId?: string | null;
  success?: boolean;
};

/**
 * Waits for account/login/completed of one login. Listening starts before
 * the login does, so a fast completion is not missed; notifications that
 * arrive before the login id is known are held until it is.
 */
export function waitForCodexLoginCompletion(
  manager: Pick<CodexAppServerManager, "subscribeNotifications">,
  signal: AbortSignal,
) {
  let loginId: string | null = null;
  const held: LoginCompletedParams[] = [];
  let settle: ((params: LoginCompletedParams) => void) | null = null;
  let cleanup = () => {};

  const promise = new Promise<void>((resolve, reject) => {
    const onAbort = () =>
      reject(signal.reason ?? new Error("The sign-in was cancelled."));
    settle = (params) => {
      if (params.loginId && loginId && params.loginId !== loginId) {
        return;
      }
      if (params.success) {
        resolve();
      } else {
        reject(
          new EngineAuthError(
            params.error?.trim() || "The ChatGPT sign-in did not complete.",
          ),
        );
      }
    };
    const unsubscribe = manager.subscribeNotifications(
      (event: CodexNotificationEvent) => {
        if (event.method !== "account/login/completed") {
          return;
        }
        const params = (event.params ?? {}) as LoginCompletedParams;
        if (loginId === null) {
          held.push(params);
          return;
        }
        settle?.(params);
      },
    );
    cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      unsubscribe();
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
  promise.catch(() => undefined);

  return {
    dispose: () => cleanup(),
    promise,
    setLoginId(id: string) {
      loginId = id;
      for (const params of held.splice(0)) {
        settle?.(params);
      }
    },
  };
}

async function loginInBrowser(
  manager: CodexLoginManager,
  type: "chatgpt" | "chatgptDeviceCode",
  context: Parameters<EngineAuthController["login"]>[2],
) {
  const completion = waitForCodexLoginCompletion(manager, context.signal);
  let loginId: string | null = null;

  try {
    const response = await manager.startLogin({ type });
    if (response.type === "chatgpt") {
      loginId = response.loginId;
      context.showBrowser(response.authUrl);
    } else if (response.type === "chatgptDeviceCode") {
      loginId = response.loginId;
      context.showDeviceCode({
        url: response.verificationUrl,
        userCode: response.userCode,
      });
    } else {
      throw new EngineAuthError("Codex answered with an unexpected sign-in.");
    }

    completion.setLoginId(loginId);
    await completion.promise;
  } catch (error) {
    if (loginId) {
      // Cancelled, expired or failed: stop Codex's callback server too.
      await manager.cancelLogin(loginId).catch(() => undefined);
    }
    throw error;
  } finally {
    completion.dispose();
  }
}

// Engine modules load on first use: this module adds nothing to what the
// driver itself imports.
async function getCodexLoginManager(
  instance: ResolvedEngineInstance,
): Promise<CodexLoginManager> {
  const { getCodexAppServerManager } =
    await import("@/lib/ai/chat/engines/codex-app-server");
  return getCodexAppServerManager(instance);
}

export function createCodexAuth(
  getManager: (
    instance: ResolvedEngineInstance,
  ) => Promise<CodexLoginManager> = getCodexLoginManager,
): EngineAuthController {
  return {
    async methods(instance) {
      const { resolveCodexCli } =
        await import("@/lib/ai/chat/engines/codex-cli");
      if (!(await resolveCodexCli({ instance }))) {
        return [];
      }

      return [
        {
          description:
            "Opens the ChatGPT sign-in page; Codex finishes the sign-in on this computer.",
          id: CODEX_CHATGPT_METHOD_ID,
          label: "Sign in with ChatGPT",
          type: "browser",
        },
        {
          description:
            "For when the browser cannot reach this computer: enter a code on the ChatGPT page.",
          id: CODEX_DEVICE_CODE_METHOD_ID,
          label: "Use a device code",
          type: "device-code",
        },
        {
          description: "Codex stores the key in its own home.",
          id: API_KEY_METHOD_ID,
          label: "Use an API key",
          type: "credentials",
        },
      ];
    },

    async login(instance, methodId, context) {
      const manager = await getManager(instance);

      if (methodId === API_KEY_METHOD_ID) {
        const values = await context.requestCredentials([
          { label: "OpenAI API key", name: "OPENAI_API_KEY", secret: true },
        ]);
        await manager.startLogin({
          apiKey: values.OPENAI_API_KEY!,
          type: "apiKey",
        });
        return;
      }

      await loginInBrowser(
        manager,
        methodId === CODEX_DEVICE_CODE_METHOD_ID
          ? "chatgptDeviceCode"
          : "chatgpt",
        context,
      );
    },

    async logout(instance) {
      await (await getManager(instance)).logout();
    },
  };
}

export const codexAuth = createCodexAuth();
