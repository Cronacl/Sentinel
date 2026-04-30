const RELEASES_BASE_URL = "https://github.com/Cronacl/Sentinel/releases";
const MISSING_MAC_ZIP_ERROR =
  "Background update metadata is missing the macOS ZIP artifact. Download the latest installer manually, then try background updates again after the next release.";

const BLOCK_TAGS = new Set([
  "blockquote",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

function decodeHtmlEntities(value) {
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === "#") {
        const radix = entity[1]?.toLowerCase() === "x" ? 16 : 10;
        const codePoint = Number.parseInt(
          entity.slice(radix === 16 ? 2 : 1),
          radix,
        );
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : match;
      }

      switch (entity.toLowerCase()) {
        case "amp":
          return "&";
        case "apos":
          return "'";
        case "gt":
          return ">";
        case "lt":
          return "<";
        case "nbsp":
          return " ";
        case "quot":
          return '"';
        default:
          return match;
      }
    })
    .replace(/\u00a0/g, " ");
}

function htmlToReadableMarkdown(html) {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style|noscript|meta|link)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<(meta|link)\b[^>]*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => {
        return `\n\n${"#".repeat(Number(level))} ${stripInlineHtml(text)}\n\n`;
      })
      .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, text) => {
        return `\n- ${stripInlineHtml(text).replace(/\s+/g, " ").trim()}`;
      })
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
      .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "_$2_")
      .replace(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi, (match, tag) => {
        return BLOCK_TAGS.has(tag.toLowerCase()) ? "\n\n" : "";
      }),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/^\s*-\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^(#{1,6} .+)\n(?=- )/gm, "$1\n\n")
    .trim();
}

function stripInlineHtml(html) {
  return decodeHtmlEntities(
    html
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
      .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "_$2_")
      .replace(/<[^>]*>/g, ""),
  ).trim();
}

function normalizeReleaseNoteText(note) {
  const trimmed = note.trim();
  if (!trimmed) {
    return null;
  }

  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    const markdown = htmlToReadableMarkdown(trimmed);
    return markdown || null;
  }

  return trimmed;
}

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
    return normalizeReleaseNoteText(releaseNotes);
  }

  if (!Array.isArray(releaseNotes)) {
    return null;
  }

  const joined = releaseNotes
    .map((entry) => {
      if (!entry || typeof entry.note !== "string") {
        return null;
      }

      const note = normalizeReleaseNoteText(entry.note);
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
    errorMessage: serializeUpdateError(error),
    status: "error",
  };
}

function applySuppressedErrorState(state, checkedAt) {
  return {
    ...state,
    checkedAt,
    downloadPercent: null,
    errorMessage: null,
    status: state.status === "checking" ? "idle" : state.status,
  };
}

export function serializeUpdateError(error) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (
    message.includes("ZIP file not provided") ||
    (/Cannot download .+\.zip/i.test(message) &&
      /\bstatus 404\b/i.test(message))
  ) {
    return MISSING_MAC_ZIP_ERROR;
  }

  return message || "Unable to check for updates.";
}

export function isTransientReleaseMetadataError(error) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!message) {
    return false;
  }

  return (
    /Cannot find latest(?:-[a-z0-9]+)?\.ya?ml in the latest release artifacts/i.test(
      message,
    ) ||
    (/\/releases\/download\/[^)\s"']+\/latest(?:-[a-z0-9]+)?\.ya?ml/i.test(
      message,
    ) &&
      /(?:HttpError:\s*)?404\b/i.test(message))
  );
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
      if (isTransientReleaseMetadataError(error)) {
        replaceState(applySuppressedErrorState(state, now()));
        return;
      }

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
      if (isTransientReleaseMetadataError(error)) {
        return replaceState(applySuppressedErrorState(state, now()));
      }

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
  applySuppressedErrorState,
  applyUpToDateState,
  createUnsupportedUpdateState,
  normalizeReleaseNoteText,
};
