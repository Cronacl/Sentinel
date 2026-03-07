export type DesktopDirectorySelection = {
  name: string;
  path: string;
};

export type DesktopServicesStatus = {
  appServer: boolean;
  docker: boolean;
  postgres: boolean;
  qdrant: boolean;
  redis: boolean;
};

export type SentinelDesktopApi = {
  app: {
    getVersion: () => Promise<string>;
  };
  pickDirectory: () => Promise<DesktopDirectorySelection | null>;
  services: {
    start: () => Promise<DesktopServicesStatus>;
    status: () => Promise<DesktopServicesStatus>;
    stop: () => Promise<DesktopServicesStatus>;
  };
  window: {
    close: () => Promise<void>;
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
  };
};
