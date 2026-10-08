// Every ACP method name Sentinel sends or serves, behind one table. The
// stable v1 surface of @agentclientprotocol/sdk 1.7 is the only protocol
// spoken today (design critique §1 #11); the experimental v2 draft renames
// several methods (authenticate → auth/login, no session/set_mode), and
// supporting it later means adding a second table, not editing call sites.

export type AcpMethodTable = {
  readonly protocolVersion: number;

  // Client → agent requests.
  readonly authenticate: string;
  readonly initialize: string;
  readonly logout: string;
  readonly sessionClose: string;
  readonly sessionLoad: string;
  readonly sessionNew: string;
  readonly sessionPrompt: string;
  readonly sessionResume: string;
  readonly sessionSetConfigOption: string;
  readonly sessionSetMode: string;
  /** Unstable and outside the 1.7 method tables: sent as a raw string. */
  readonly sessionSetModel: string;

  // Client → agent notifications. Cancel is never a request.
  readonly sessionCancel: string;

  // Agent → client.
  readonly elicitationComplete: string;
  readonly elicitationCreate: string;
  readonly fsReadTextFile: string;
  readonly fsWriteTextFile: string;
  readonly requestPermission: string;
  readonly sessionUpdate: string;
  readonly terminalCreate: string;
  readonly terminalKill: string;
  readonly terminalOutput: string;
  readonly terminalRelease: string;
  readonly terminalWaitForExit: string;
};

export const ACP_V1_METHODS: AcpMethodTable = {
  authenticate: "authenticate",
  elicitationComplete: "elicitation/complete",
  elicitationCreate: "elicitation/create",
  fsReadTextFile: "fs/read_text_file",
  fsWriteTextFile: "fs/write_text_file",
  initialize: "initialize",
  logout: "logout",
  protocolVersion: 1,
  requestPermission: "session/request_permission",
  sessionCancel: "session/cancel",
  sessionClose: "session/close",
  sessionLoad: "session/load",
  sessionNew: "session/new",
  sessionPrompt: "session/prompt",
  sessionResume: "session/resume",
  sessionSetConfigOption: "session/set_config_option",
  sessionSetMode: "session/set_mode",
  sessionSetModel: "session/set_model",
  sessionUpdate: "session/update",
  terminalCreate: "terminal/create",
  terminalKill: "terminal/kill",
  terminalOutput: "terminal/output",
  terminalRelease: "terminal/release",
  terminalWaitForExit: "terminal/wait_for_exit",
};

/**
 * What inbound `session/update` notifications are renamed to before the
 * SDK sees them (trap 1, transport.ts): the SDK's own SessionUpdateRouter
 * parses `session/update` strictly and aborts the handler chain on any
 * update kind outside its union.
 */
export const SENTINEL_SESSION_UPDATE_METHOD = "_sentinel/session_update";
