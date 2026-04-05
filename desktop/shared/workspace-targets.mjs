import path from "node:path";

const MAC_TARGETS = [
  {
    appNames: ["Cursor.app"],
    id: "cursor",
    kind: "editor",
    label: "Cursor",
    supportsGoto: true,
  },
  {
    appNames: ["Visual Studio Code.app"],
    id: "vscode",
    kind: "editor",
    label: "VS Code",
    supportsGoto: true,
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
    supportsGoto: true,
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

const WINDOWS_EDITOR_TARGETS = [
  {
    commandCandidates: [
      "cursor.exe",
      "cursor",
      "Cursor.exe",
      "%LOCALAPPDATA%\\Programs\\Cursor\\Cursor.exe",
      "%ProgramFiles%\\Cursor\\Cursor.exe",
      "%ProgramFiles(x86)%\\Cursor\\Cursor.exe",
    ],
    id: "cursor",
    kind: "editor",
    label: "Cursor",
    supportsGoto: true,
  },
  {
    commandCandidates: [
      "code.cmd",
      "code.exe",
      "code",
      "%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe",
      "%ProgramFiles%\\Microsoft VS Code\\Code.exe",
      "%ProgramFiles(x86)%\\Microsoft VS Code\\Code.exe",
    ],
    id: "vscode",
    kind: "editor",
    label: "VS Code",
    supportsGoto: true,
  },
  {
    commandCandidates: [
      "windsurf.exe",
      "windsurf",
      "%LOCALAPPDATA%\\Programs\\Windsurf\\Windsurf.exe",
      "%ProgramFiles%\\Windsurf\\Windsurf.exe",
      "%ProgramFiles(x86)%\\Windsurf\\Windsurf.exe",
    ],
    id: "windsurf",
    kind: "editor",
    label: "Windsurf",
    supportsGoto: true,
  },
];

const LINUX_EDITOR_TARGETS = [
  {
    commandCandidates: ["cursor", "cursor.AppImage"],
    id: "cursor",
    kind: "editor",
    label: "Cursor",
    supportsGoto: true,
  },
  {
    commandCandidates: ["code", "code-insiders"],
    id: "vscode",
    kind: "editor",
    label: "VS Code",
    supportsGoto: true,
  },
  {
    commandCandidates: ["windsurf"],
    id: "windsurf",
    kind: "editor",
    label: "Windsurf",
    supportsGoto: true,
  },
];

const LINUX_TERMINAL_TARGETS = [
  {
    commandCandidates: ["kgx"],
    id: "terminal",
    kind: "terminal",
    label: "Console",
  },
  {
    commandCandidates: ["gnome-terminal"],
    id: "gnome-terminal",
    kind: "terminal",
    label: "GNOME Terminal",
  },
  {
    commandCandidates: ["konsole"],
    id: "konsole",
    kind: "terminal",
    label: "Konsole",
  },
  {
    commandCandidates: ["xfce4-terminal"],
    id: "xfce4-terminal",
    kind: "terminal",
    label: "Xfce Terminal",
  },
  {
    commandCandidates: ["kitty"],
    id: "kitty",
    kind: "terminal",
    label: "Kitty",
  },
  {
    commandCandidates: ["alacritty"],
    id: "alacritty",
    kind: "terminal",
    label: "Alacritty",
  },
  {
    commandCandidates: ["wezterm"],
    id: "wezterm",
    kind: "terminal",
    label: "WezTerm",
  },
  {
    commandCandidates: ["x-terminal-emulator"],
    id: "x-terminal-emulator",
    kind: "terminal",
    label: "Terminal",
  },
  {
    commandCandidates: ["xterm"],
    id: "xterm",
    kind: "terminal",
    label: "xterm",
  },
];

function expandEnvironmentVariables(candidate, env) {
  return candidate.replace(/%([^%]+)%/g, (_match, variable) => {
    return env?.[variable] || "";
  });
}

function expandMacAppCandidates(appNames, homePath) {
  return (appNames ?? []).flatMap((appName) =>
    path.isAbsolute(appName)
      ? [appName]
      : [
          path.join("/Applications", appName),
          path.join(homePath, "Applications", appName),
        ],
  );
}

async function resolveMacTargets({ exists, homePath }) {
  const targets = [];

  for (const target of MAC_TARGETS) {
    if (target.id === "finder") {
      targets.push(target);
      continue;
    }

    const candidates = expandMacAppCandidates(target.appNames, homePath);
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
      platform: "darwin",
    });
  }

  return targets;
}

async function resolveCommandTargetCandidates(
  targets,
  { env, exists, whichExecutable, platform },
) {
  const resolvedTargets = [];

  for (const target of targets) {
    const commandCandidates = (target.commandCandidates ?? []).map(
      (candidate) => expandEnvironmentVariables(candidate, env),
    );
    let commandPath = null;

    for (const candidate of commandCandidates) {
      if (!candidate) {
        continue;
      }

      if (path.isAbsolute(candidate)) {
        if (await exists(candidate)) {
          commandPath = candidate;
          break;
        }

        continue;
      }

      const resolved = await whichExecutable(candidate);
      if (resolved) {
        commandPath = resolved;
        break;
      }
    }

    if (!commandPath) {
      continue;
    }

    resolvedTargets.push({
      ...target,
      commandPath,
      platform,
    });
  }

  return resolvedTargets;
}

export async function resolveOpenTargets({
  env = process.env,
  exists,
  homePath,
  platform,
  whichExecutable,
}) {
  if (platform === "darwin") {
    return resolveMacTargets({ exists, homePath });
  }

  if (platform === "win32") {
    const editorTargets = await resolveCommandTargetCandidates(
      WINDOWS_EDITOR_TARGETS,
      {
        env,
        exists,
        platform,
        whichExecutable,
      },
    );

    return [
      ...editorTargets,
      {
        commandPath: "explorer.exe",
        id: "file-manager",
        kind: "file_manager",
        label: "File Explorer",
        platform,
      },
      {
        commandPath:
          (await whichExecutable("wt.exe")) ||
          (await whichExecutable("powershell.exe")) ||
          (await whichExecutable("cmd.exe")),
        id: "terminal",
        kind: "terminal",
        label: (await whichExecutable("wt.exe"))
          ? "Windows Terminal"
          : (await whichExecutable("powershell.exe"))
            ? "PowerShell"
            : "Command Prompt",
        platform,
      },
    ].filter((target) => Boolean(target.commandPath));
  }

  const editorTargets = await resolveCommandTargetCandidates(
    LINUX_EDITOR_TARGETS,
    {
      env,
      exists,
      platform,
      whichExecutable,
    },
  );
  const terminalTargets = await resolveCommandTargetCandidates(
    LINUX_TERMINAL_TARGETS,
    {
      env,
      exists,
      platform,
      whichExecutable,
    },
  );
  const fileManager = await whichExecutable("xdg-open");

  return [
    ...editorTargets,
    ...(fileManager
      ? [
          {
            commandPath: fileManager,
            id: "file-manager",
            kind: "file_manager",
            label: "File Manager",
            platform,
          },
        ]
      : []),
    ...terminalTargets,
  ];
}

export async function resolveMacOpenTargets(args) {
  return resolveMacTargets(args);
}

function buildMacOpenCommand(target, projectPath) {
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

function buildWindowsDirectoryOpenCommand(target, projectPath) {
  if (target.kind === "file_manager") {
    return {
      args: [projectPath],
      command: target.commandPath,
    };
  }

  if (target.kind === "terminal") {
    const commandPath = target.commandPath.toLowerCase();
    if (commandPath.endsWith("wt.exe")) {
      return {
        args: ["-d", projectPath],
        command: target.commandPath,
      };
    }

    if (commandPath.endsWith("powershell.exe")) {
      return {
        args: [
          "-NoExit",
          "-Command",
          `Set-Location -LiteralPath '${projectPath.replace(/'/g, "''")}'`,
        ],
        command: target.commandPath,
      };
    }

    return {
      args: ["/K", `cd /d "${projectPath}"`],
      command: target.commandPath,
    };
  }

  return {
    args: [projectPath],
    command: target.commandPath,
  };
}

function buildLinuxDirectoryOpenCommand(target, projectPath) {
  if (target.kind === "file_manager") {
    return {
      args: [projectPath],
      command: target.commandPath,
    };
  }

  switch (target.id) {
    case "terminal":
      return {
        args: ["--working-directory", projectPath],
        command: target.commandPath,
      };
    case "gnome-terminal":
      return {
        args: ["--working-directory", projectPath],
        command: target.commandPath,
      };
    case "konsole":
      return {
        args: ["--workdir", projectPath],
        command: target.commandPath,
      };
    case "xfce4-terminal":
      return {
        args: ["--working-directory", projectPath],
        command: target.commandPath,
      };
    case "kitty":
      return {
        args: ["--directory", projectPath],
        command: target.commandPath,
      };
    case "alacritty":
      return {
        args: ["--working-directory", projectPath],
        command: target.commandPath,
      };
    case "wezterm":
      return {
        args: ["start", "--cwd", projectPath],
        command: target.commandPath,
      };
    case "x-terminal-emulator":
    case "xterm":
      return {
        args: [
          "-e",
          `sh -lc 'cd "${projectPath}" && exec "${process.env.SHELL || "/bin/sh"}" -l'`,
        ],
        command: target.commandPath,
      };
    default:
      return {
        args: [projectPath],
        command: target.commandPath,
      };
  }
}

export function getOpenCommandForTarget(target, projectPath) {
  switch (target.platform) {
    case "darwin":
      return buildMacOpenCommand(target, projectPath);
    case "win32":
      return buildWindowsDirectoryOpenCommand(target, projectPath);
    default:
      return buildLinuxDirectoryOpenCommand(target, projectPath);
  }
}

function buildMacOpenFileCommand(target, filePath, lineNumber) {
  if (target.id === "finder") {
    return {
      args: ["-R", filePath],
      command: "open",
    };
  }

  const application = target.appPath ?? target.systemApp ?? target.label;
  const lineSuffix =
    typeof lineNumber === "number" &&
    Number.isFinite(lineNumber) &&
    lineNumber > 0
      ? `:${Math.trunc(lineNumber)}`
      : "";
  const supportsGoto = new Set(["cursor", "vscode", "windsurf"]);

  if (supportsGoto.has(target.id)) {
    return {
      args: ["-a", application, "--args", "-g", `${filePath}${lineSuffix}`],
      command: "open",
    };
  }

  return {
    args: ["-a", application, filePath],
    command: "open",
  };
}

export function getOpenFileCommandForTarget(target, filePath, lineNumber) {
  if (target.platform === "darwin") {
    return buildMacOpenFileCommand(target, filePath, lineNumber);
  }

  if (target.kind === "file_manager") {
    return target.platform === "win32"
      ? {
          args: ["/select,", filePath],
          command: target.commandPath,
        }
      : {
          args: [path.dirname(filePath)],
          command: target.commandPath,
        };
  }

  const lineSuffix =
    typeof lineNumber === "number" &&
    Number.isFinite(lineNumber) &&
    lineNumber > 0
      ? `:${Math.trunc(lineNumber)}`
      : "";

  if (target.supportsGoto) {
    return {
      args: ["-g", `${filePath}${lineSuffix}`],
      command: target.commandPath,
    };
  }

  return {
    args: [filePath],
    command: target.commandPath,
  };
}

export function getRevealInFileManagerCommand(platform, projectPath) {
  if (platform === "darwin") {
    return {
      args: [projectPath],
      command: "open",
    };
  }

  if (platform === "win32") {
    return {
      args: [projectPath],
      command: "explorer.exe",
    };
  }

  return {
    args: [projectPath],
    command: "xdg-open",
  };
}
