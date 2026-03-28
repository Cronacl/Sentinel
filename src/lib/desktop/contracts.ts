export type DesktopDirectorySelection = {
  name: string;
  path: string;
};

export type DesktopFileSelection = {
  mimeType?: string;
  name: string;
  path: string;
  size?: number;
};

export type DesktopServicesStatus = {
  appServer: boolean;
};

export type DesktopResolvedTheme = "light" | "dark";
export type DesktopPlatform = "darwin" | "linux" | "win32";

export type DesktopOpenTarget = {
  icon?: string;
  id: string;
  kind: "editor" | "file_manager" | "ide" | "terminal";
  label: string;
};

export type DesktopTerminalSession = {
  pid: number;
  sessionId: string;
};

export type SentinelDesktopApi = {
  app: {
    getVersion: () => Promise<string>;
    platform: DesktopPlatform;
  };
  openExternal: (url: string) => Promise<void>;
  pickFiles: () => Promise<DesktopFileSelection[]>;
  pickDirectory: () => Promise<DesktopDirectorySelection | null>;
  services: {
    start: () => Promise<DesktopServicesStatus>;
    status: () => Promise<DesktopServicesStatus>;
    stop: () => Promise<DesktopServicesStatus>;
  };
  workspace: {
    listOpenTargets: (projectPath: string) => Promise<DesktopOpenTarget[]>;
    openFileInTarget: (
      projectPath: string,
      filePath: string,
      targetId?: string,
      lineNumber?: number,
    ) => Promise<void>;
    openInTarget: (projectPath: string, targetId: string) => Promise<void>;
    openInTerminal: (
      projectPath: string,
      terminalTargetId?: string,
    ) => Promise<void>;
    revealInFileManager: (projectPath: string) => Promise<void>;
  };
  terminal: {
    create: (cwd: string) => Promise<DesktopTerminalSession>;
    write: (sessionId: string, data: string) => void;
    resize: (sessionId: string, cols: number, rows: number) => void;
    kill: (sessionId: string) => Promise<void>;
    onData: (callback: (sessionId: string, data: string) => void) => () => void;
    onExit: (
      callback: (sessionId: string, exitCode: number) => void,
    ) => () => void;
  };
  window: {
    close: () => Promise<void>;
    minimize: () => Promise<void>;
    syncTheme: (theme: DesktopResolvedTheme) => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
  };
};
