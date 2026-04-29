export type RedisConnectionType = "Standalone" | "Sentinel" | "Cluster";

export interface ConnectionFormData {
  id?: string;
  name: string;
  groupName?: string;
  host: string;
  port: number;
  password?: string;
  dbIndex: number;
  connectionType: RedisConnectionType;
}

export interface ConnectionInfo {
  id: string;
  name: string;
  groupName?: string;
  host: string;
  port: number;
  dbIndex: number;
  connectionType: string;
  createdAt: string;
}

export interface RedisLatency {
  millis: number;
}

export interface RedisServerInfo {
  version: string;
  mode: string;
}

export interface KeyMeta {
  key: string;
  keyType: string;
  ttl: number;
}

export interface ScanResult {
  nextCursor: number;
  keys: KeyMeta[];
}

export interface HashField {
  field: string;
  value: string;
}

export interface ZMember {
  member: string;
  score: number;
}

export interface SlowlogEntry {
  id: number;
  timestamp: number;
  durationMicros: number;
  command: string;
}

export interface ServerInfo {
  server: Record<string, string>;
  clients: Record<string, string>;
  memory: Record<string, string>;
  stats: Record<string, string>;
  replication: Record<string, string>;
}

export interface ImportResult {
  successCount: number;
  failedCount: number;
  errors: string[];
}

export interface ExportItem {
  key: string;
  keyType: string;
  ttl: number;
  value: unknown;
}

export type ExportFormat = "Json" | "Csv";

export type RedisValue =
  | { kind: "nil" }
  | { kind: "int"; value: number }
  | { kind: "bulk"; value: string }
  | { kind: "array"; value: RedisValue[] }
  | { kind: "error"; value: string };
