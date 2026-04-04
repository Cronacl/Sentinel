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

export type DesktopSystemFontFamily = {
  family: string;
};

export type DesktopResolvedTheme = "light" | "dark";
export type DesktopPlatform = "darwin" | "linux" | "win32";
export type DesktopPermissionName = "microphone";
export type DesktopPermissionState =
  | "denied"
  | "granted"
  | "prompt"
  | "unsupported";
export type DesktopUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "up_to_date"
  | "error";

export type DesktopOpenTarget = {
  icon?: string;
  id: string;
  kind: "editor" | "file_manager" | "ide" | "terminal";
  label: string;
};

export type DesktopUpdateState = {
  availableVersion: string | null;
  bytesTotal: number | null;
  bytesTransferred: number | null;
  checkedAt: string | null;
  currentVersion: string;
  downloadPercent: number | null;
  errorMessage: string | null;
  isSupported: boolean;
  releaseDate: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  releasePageUrl: string | null;
  status: DesktopUpdateStatus;
  supportReason: string | null;
};

export type DesktopTerminalSession = {
  pid: number;
  sessionId: string;
};

export type SentinelDesktopApi = {
  app: {
    getVersion: () => Promise<string>;
    listSystemFonts: () => Promise<DesktopSystemFontFamily[]>;
    platform: DesktopPlatform;
  };
  clipboard: {
    writeText: (text: string) => Promise<void>;
  };
  openExternal: (url: string) => Promise<void>;
  permissions: {
    getStatus: (name: DesktopPermissionName) => Promise<DesktopPermissionState>;
    request: (name: DesktopPermissionName) => Promise<DesktopPermissionState>;
  };
  pickFiles: () => Promise<DesktopFileSelection[]>;
  pickDirectory: () => Promise<DesktopDirectorySelection | null>;
  services: {
    start: () => Promise<DesktopServicesStatus>;
    status: () => Promise<DesktopServicesStatus>;
    stop: () => Promise<DesktopServicesStatus>;
  };
  updates: {
    check: () => Promise<DesktopUpdateState>;
    getState: () => Promise<DesktopUpdateState>;
    install: () => Promise<void>;
    onStateChange: (
      callback: (state: DesktopUpdateState) => void,
    ) => () => void;
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
