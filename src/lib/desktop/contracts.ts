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

export type DesktopOpenTarget = {
  icon?: string;
  id: string;
  kind: "editor" | "file_manager" | "ide" | "terminal";
  label: string;
};

export type SentinelDesktopApi = {
  app: {
    getVersion: () => Promise<string>;
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
    openInTarget: (projectPath: string, targetId: string) => Promise<void>;
    openInTerminal: (
      projectPath: string,
      terminalTargetId?: string,
    ) => Promise<void>;
    revealInFileManager: (projectPath: string) => Promise<void>;
  };
  window: {
    close: () => Promise<void>;
    minimize: () => Promise<void>;
    syncTheme: (theme: DesktopResolvedTheme) => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
  };
};
