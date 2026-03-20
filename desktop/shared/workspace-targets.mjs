import path from "node:path";

export const CURATED_OPEN_TARGETS = [
  {
    appNames: ["Cursor.app"],
    id: "cursor",
    kind: "editor",
    label: "Cursor",
  },
  {
    appNames: ["Visual Studio Code.app"],
    id: "vscode",
    kind: "editor",
    label: "VS Code",
  },
  {
    appNames: ["Zed.app"],
    id: "zed",
    kind: "editor",
    label: "Zed",
  },
  {
    appNames: ["Windsurf.app"],
    id: "windsurf",
    kind: "editor",
    label: "Windsurf",
  },
  {
    appNames: ["Xcode.app"],
    id: "xcode",
    kind: "ide",
    label: "Xcode",
  },
  {
    appNames: ["Android Studio.app"],
    id: "android-studio",
    kind: "ide",
    label: "Android Studio",
  },
  {
    id: "finder",
    kind: "file_manager",
    label: "Finder",
    systemApp: "Finder",
  },
  {
    appNames: [
      path.join("/System/Applications/Utilities", "Terminal.app"),
      path.join("/Applications/Utilities", "Terminal.app"),
    ],
    id: "terminal",
    kind: "terminal",
    label: "Terminal",
  },
  {
    appNames: ["Ghostty.app"],
    id: "ghostty",
    kind: "terminal",
    label: "Ghostty",
  },
];

function expandAppCandidates(appNames, homePath) {
  return (appNames ?? []).flatMap((appName) =>
    path.isAbsolute(appName)
      ? [appName]
      : [
          path.join("/Applications", appName),
          path.join(homePath, "Applications", appName),
        ],
  );
}

export async function resolveMacOpenTargets({ exists, homePath }) {
  const targets = [];

  for (const target of CURATED_OPEN_TARGETS) {
    if (target.id === "finder") {
      targets.push(target);
      continue;
    }

    const candidates = expandAppCandidates(target.appNames, homePath);
    let appPath = null;

    for (const candidate of candidates) {
      if (await exists(candidate)) {
        appPath = candidate;
        break;
      }
    }

    if (!appPath) {
      continue;
    }

    targets.push({
      ...target,
      appPath,
    });
  }

  return targets;
}

export function getOpenCommandForTarget(target, projectPath) {
  if (target.id === "finder") {
    return {
      args: [projectPath],
      command: "open",
    };
  }

  const application = target.appPath ?? target.systemApp ?? target.label;

  return {
    args: ["-a", application, projectPath],
    command: "open",
  };
}
