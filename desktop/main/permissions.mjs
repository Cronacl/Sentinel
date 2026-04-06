const TRUSTED_DESKTOP_PERMISSIONS = new Set([
  "media",
  "microphone",
  "clipboard-sanitized-write",
]);

export function shouldAllowTrustedDesktopPermission(
  permission,
  requestingUrl,
  isTrustedOrigin,
  ownerUrl = "",
) {
  if (permission === "clipboard-read") {
    return false;
  }

  if (!TRUSTED_DESKTOP_PERMISSIONS.has(permission)) {
    return false;
  }

  return isTrustedOrigin(requestingUrl) || isTrustedOrigin(ownerUrl);
}

export function configureDesktopPermissionHandlers(
  targetSession,
  { isTrustedOrigin, logger = console },
) {
  const shouldAllow = (permission, requestUrl, ownerUrl) => {
    const allowed = shouldAllowTrustedDesktopPermission(
      permission,
      requestUrl,
      isTrustedOrigin,
      ownerUrl,
    );

    if (!allowed && (permission === "media" || permission === "microphone")) {
      logger.warn?.("[electron] denied desktop media permission", {
        ownerUrl,
        permission,
        requestUrl,
      });
    }

    return allowed;
  };

  targetSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) =>
      shouldAllow(
        permission,
        requestingOrigin || "",
        webContents?.getURL?.() || "",
      ),
  );

  targetSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      callback(
        shouldAllow(
          permission,
          details?.requestingUrl || "",
          webContents?.getURL?.() || "",
        ),
      );
    },
  );
}

export function normalizeMicrophonePermissionState(status, platform) {
  if (platform !== "darwin" && platform !== "win32") {
    return "unsupported";
  }

  if (status === "granted") {
    return "granted";
  }

  if (status === "denied" || status === "restricted") {
    return "denied";
  }

  if (status === "not-determined") {
    return "prompt";
  }

  return platform === "win32" ? "prompt" : "unsupported";
}

export function getDesktopMicrophonePermissionState({
  platform,
  systemPreferences,
}) {
  try {
    return normalizeMicrophonePermissionState(
      systemPreferences.getMediaAccessStatus("microphone"),
      platform,
    );
  } catch {
    return platform === "win32" ? "prompt" : "unsupported";
  }
}

export async function requestDesktopMicrophonePermission({
  platform,
  systemPreferences,
}) {
  const currentState = getDesktopMicrophonePermissionState({
    platform,
    systemPreferences,
  });

  if (currentState !== "prompt") {
    return currentState;
  }

  if (platform !== "darwin") {
    return currentState;
  }

  try {
    const granted = await systemPreferences.askForMediaAccess("microphone");
    return granted ? "granted" : "denied";
  } catch {
    return getDesktopMicrophonePermissionState({
      platform,
      systemPreferences,
    });
  }
}
