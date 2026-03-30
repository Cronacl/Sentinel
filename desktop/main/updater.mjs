const RELEASES_BASE_URL = "https://github.com/chaqchase/Sentinel/releases";
export const PRIVATE_GITHUB_RELEASES_UNSUPPORTED_REASON =
  "Background updates are currently unavailable because Sentinel desktop builds are published through a private GitHub Releases feed. Use Release notes to download and install new versions manually.";

export function buildReleasePageUrl(version) {
  if (typeof version !== "string" || !version.trim()) {
    return RELEASES_BASE_URL;
  }

  return `${RELEASES_BASE_URL}/tag/v${version.trim()}`;
}

export function serializeReleaseNotes(releaseNotes) {
  if (!releaseNotes) {
    return null;
  }

  if (typeof releaseNotes === "string") {
    const trimmed = releaseNotes.trim();
    return trimmed ? trimmed : null;
  }

  if (!Array.isArray(releaseNotes)) {
    return null;
  }

  const joined = releaseNotes
    .map((entry) => {
      if (!entry || typeof entry.note !== "string") {
        return null;
      }

      const note = entry.note.trim();
      if (!note) {
        return null;
      }

      const versionPrefix =
        typeof entry.version === "string" && entry.version.trim()
          ? `## ${entry.version.trim()}\n`
          : "";

      return `${versionPrefix}${note}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return joined || null;
}

export function createInitialUpdateState(currentVersion) {
  return {
    availableVersion: null,
    bytesTotal: null,
    bytesTransferred: null,
    checkedAt: null,
    currentVersion,
    downloadPercent: null,
    errorMessage: null,
    isSupported: true,
    releaseDate: null,
    releaseName: null,
    releaseNotes: null,
    releasePageUrl: null,
    status: "idle",
    supportReason: null,
  };
}

function createUnsupportedUpdateState(currentVersion, supportReason) {
  return {
    ...createInitialUpdateState(currentVersion),
    isSupported: false,
    supportReason,
  };
}

function applyCheckingState(state, checkedAt) {
  return {
    ...state,
    checkedAt,
    currentVersion: state.currentVersion,
    errorMessage: null,
    status: "checking",
  };
}

function applyAvailableState(state, info, checkedAt) {
  return {
    ...state,
    availableVersion: info.version ?? state.availableVersion,
    bytesTotal: null,
    bytesTransferred: null,
    checkedAt,
    downloadPercent: null,
    errorMessage: null,
    releaseDate: info.releaseDate ?? state.releaseDate,
    releaseName: info.releaseName ?? state.releaseName,
    releaseNotes: serializeReleaseNotes(info.releaseNotes),
    releasePageUrl: buildReleasePageUrl(info.version),
    status: "available",
    supportReason: null,
  };
}

function applyDownloadingState(state, progress) {
  return {
    ...state,
    bytesTotal:
      typeof progress.total === "number" && Number.isFinite(progress.total)
        ? progress.total
        : null,
    bytesTransferred:
      typeof progress.transferred === "number" &&
      Number.isFinite(progress.transferred)
        ? progress.transferred
        : null,
    downloadPercent:
      typeof progress.percent === "number" && Number.isFinite(progress.percent)
        ? progress.percent
        : null,
    errorMessage: null,
    status: "downloading",
  };
}

function applyDownloadedState(state, info, checkedAt) {
  return {
    ...state,
    availableVersion: info.version ?? state.availableVersion,
    checkedAt,
    downloadPercent: 100,
    errorMessage: null,
    releaseDate: info.releaseDate ?? state.releaseDate,
    releaseName: info.releaseName ?? state.releaseName,
    releaseNotes: serializeReleaseNotes(info.releaseNotes),
    releasePageUrl: buildReleasePageUrl(info.version ?? state.availableVersion),
    status: "downloaded",
    supportReason: null,
  };
}

function applyUpToDateState(state, info, checkedAt) {
  return {
    ...state,
    availableVersion: info?.version ?? state.currentVersion,
    bytesTotal: null,
    bytesTransferred: null,
    checkedAt,
    downloadPercent: null,
    errorMessage: null,
    releaseDate: info?.releaseDate ?? null,
    releaseName: info?.releaseName ?? null,
    releaseNotes: serializeReleaseNotes(info?.releaseNotes),
    releasePageUrl: buildReleasePageUrl(info?.version ?? state.currentVersion),
    status: "up_to_date",
    supportReason: null,
  };
}

function applyErrorState(state, error, checkedAt) {
  return {
    ...state,
    checkedAt,
    downloadPercent: null,
    errorMessage:
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unable to check for updates.",
    status: "error",
  };
}

export function createDesktopUpdaterController({
  appVersion,
  backgroundUpdatesEnabled = true,
  backgroundUpdatesSupportReason = null,
  isPackaged,
  logger = console,
  now = () => new Date().toISOString(),
  platform,
  updater,
}) {
  const listeners = new Set();
  let initialized = false;
  let state = createInitialUpdateState(appVersion());

  function emit() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function replaceState(nextState) {
    state = nextState;
    emit();
    return state;
  }

  function mergeState(patch) {
    return replaceState({
      ...state,
      ...patch,
    });
  }

  function getSupportReason() {
    if (!isPackaged()) {
      return "Native background updates are only available in packaged desktop builds.";
    }

    if (!backgroundUpdatesEnabled) {
      return (
        backgroundUpdatesSupportReason ??
        "Native background updates are not available for this build."
      );
    }

    if (
      typeof updater.isUpdaterActive === "function" &&
      !updater.isUpdaterActive()
    ) {
      if (platform === "linux") {
        return "Native background updates are only available from the packaged AppImage build.";
      }

      return "Native background updates are not available for this build.";
    }

    return null;
  }

  function syncCurrentVersion() {
    const currentVersion = appVersion();
    if (state.currentVersion === currentVersion) {
      return currentVersion;
    }

    state = {
      ...state,
      currentVersion,
    };

    return currentVersion;
  }

  function registerUpdaterEvents() {
    updater.on("checking-for-update", () => {
      syncCurrentVersion();
      replaceState(applyCheckingState(state, now()));
    });

    updater.on("update-available", (info) => {
      syncCurrentVersion();
      replaceState(applyAvailableState(state, info, now()));
    });

    updater.on("download-progress", (progress) => {
      syncCurrentVersion();
      replaceState(applyDownloadingState(state, progress));
    });

    updater.on("update-downloaded", (info) => {
      syncCurrentVersion();
      replaceState(applyDownloadedState(state, info, now()));
    });

    updater.on("update-not-available", (info) => {
      syncCurrentVersion();
      replaceState(applyUpToDateState(state, info, now()));
    });

    updater.on("error", (error) => {
      syncCurrentVersion();
      replaceState(applyErrorState(state, error, now()));
    });
  }

  function initialize() {
    if (initialized) {
      return state;
    }

    initialized = true;
    state = createInitialUpdateState(appVersion());

    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;

    if ("allowDowngrade" in updater) {
      updater.allowDowngrade = false;
    }

    if ("logger" in updater) {
      updater.logger = logger;
    }

    registerUpdaterEvents();

    const supportReason = getSupportReason();
    if (supportReason) {
      state = createUnsupportedUpdateState(state.currentVersion, supportReason);
    }

    emit();
    return state;
  }

  async function checkForUpdates() {
    initialize();
    syncCurrentVersion();

    const supportReason = getSupportReason();
    if (supportReason) {
      return replaceState(
        createUnsupportedUpdateState(state.currentVersion, supportReason),
      );
    }

    updater.allowPrerelease = false;
    replaceState(applyCheckingState(state, now()));

    try {
      await updater.checkForUpdates();
    } catch (error) {
      return replaceState(applyErrorState(state, error, now()));
    }

    return state;
  }

  async function runBackgroundUpdateCheck() {
    try {
      await checkForUpdates();
    } catch {
      // state already captures the updater error path
    }
  }

  function installUpdate() {
    initialize();
    syncCurrentVersion();

    if (state.status !== "downloaded") {
      throw new Error("A downloaded update is not ready to install.");
    }

    updater.quitAndInstall();
  }

  return {
    checkForUpdates,
    getState() {
      initialize();
      syncCurrentVersion();
      return state;
    },
    initialize,
    installUpdate,
    runBackgroundUpdateCheck,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const __internal = {
  applyAvailableState,
  applyCheckingState,
  applyDownloadedState,
  applyDownloadingState,
  applyErrorState,
  applyUpToDateState,
  createUnsupportedUpdateState,
};
