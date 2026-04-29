export type SshAuthType = "password" | "key" | "key_password";

export interface SshConnectionFormData {
  id?: string;
  name: string;
  groupName?: string;
  host: string;
  port: number;
  username: string;
  authType: SshAuthType;
  password?: string;
  keyId?: string;
  keyPassphrase?: string;
  jumpHostId?: string;
  encoding?: string;
  keepaliveInterval?: number;
}

export interface SshConnectionInfo {
  id: string;
  name: string;
  groupName?: string;
  host: string;
  port: number;
  username: string;
  authType: SshAuthType;
  keyId?: string;
  jumpHostId?: string;
  encoding: string;
  keepaliveInterval: number;
  createdAt: string;
}

export interface SshLatency {
  millis: number;
}

export interface SshTerminalSessionInfo {
  sessionId: string;
  connId: string;
  createdAt: string;
}

export interface SshSessionMeta {
  sessionId: string;
  connId: string;
  tabLabel: string;
  status: "connecting" | "active" | "closed";
}

export interface SshQuickCommand {
  id: string;
  connectionId?: string;
  name: string;
  command: string;
  sortOrder: number;
}

export interface SshQuickCommandForm {
  id?: string;
  connectionId?: string;
  name: string;
  command: string;
  sortOrder?: number;
}

export interface SshKeyInfo {
  id: string;
  name: string;
  keyType: string;
  privateKeyPath: string;
  publicKey: string;
  createdAt: string;
}

export interface SshGeneratedKeyPair {
  keyType: string;
  privateKeyPem: string;
  publicKey: string;
}

export interface TunnelRule {
  id: string;
  connectionId: string;
  name: string;
  tunnelType: "local" | "remote" | "dynamic";
  localHost?: string;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
  autoStart: boolean;
  status: "stopped" | "running" | "error";
}

export interface TunnelRuleForm {
  id?: string;
  connectionId: string;
  name: string;
  tunnelType: "local" | "remote" | "dynamic";
  localHost?: string;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
  autoStart?: boolean;
}

export interface TunnelStartForm {
  ruleId: string;
  connectionId: string;
  localHost?: string;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
}
