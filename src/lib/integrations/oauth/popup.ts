type IntegrationOAuthMessage = {
  success?: boolean;
  type?: string;
};

export async function openIntegrationOAuthPopup(
  authorizationUrl: string,
  onComplete: () => void | Promise<void>,
): Promise<void> {
  const popup = window.open(
    authorizationUrl,
    "sentinel-integration-oauth",
    "width=600,height=700",
  );

  if (!popup) {
    throw new Error("Unable to open the authorization window.");
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let closeRejectTimeout: number | null = null;
    const channel = new BroadcastChannel("sentinel-integration-oauth");

    const complete = async () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      try {
        await onComplete();
        try {
          popup.close();
        } catch {}
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      channel.close();
      window.clearInterval(timer);
      if (closeRejectTimeout !== null) {
        window.clearTimeout(closeRejectTimeout);
      }
    };

    const handleMessage = (
      data: IntegrationOAuthMessage | null | undefined,
    ) => {
      if (!data?.success || data.type !== "integration-oauth-complete") {
        return;
      }

      void complete();
    };

    const onMessage = (event: MessageEvent<IntegrationOAuthMessage>) => {
      handleMessage(event.data);
    };

    channel.onmessage = (event) => {
      handleMessage(event.data);
    };

    window.addEventListener("message", onMessage);

    const timer = window.setInterval(() => {
      if (!popup.closed) {
        return;
      }

      if (settled || closeRejectTimeout !== null) {
        return;
      }

      closeRejectTimeout = window.setTimeout(() => {
        if (settled) {
          return;
        }

        cleanup();
        reject(
          new Error(
            "The authorization window was closed before the connection completed.",
          ),
        );
      }, 1000);
    }, 500);
  });
}
