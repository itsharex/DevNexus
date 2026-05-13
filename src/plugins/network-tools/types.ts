export type NetworkToolType = "ping" | "tcp" | "dns" | "traceroute";

export interface NetworkHistoryItem {
  id: string;
  toolType: NetworkToolType;
  target: string;
  paramsJson: string;
  status: "success" | "failed" | string;
  durationMs: number;
  summary: string;
  resultJson: string;
  createdAt: string;
}

export interface TcpCheckResult {
  connected: boolean;
  host: string;
  port: number;
  durationMs: number;
  remoteAddr?: string | null;
  error?: string | null;
}

export interface PingResult {
  target: string;
  transmitted?: number | null;
  received?: number | null;
  lossPercent?: number | null;
  avgMs?: number | null;
  durationMs: number;
  rawOutput: string;
  success: boolean;
}

export interface DnsLookupResult {
  host: string;
  recordType: string;
  addresses: string[];
  durationMs: number;
}

export interface TraceHop {
  hop: number;
  address?: string | null;
  rawLine: string;
}

export interface TracerouteResult {
  target: string;
  hops: TraceHop[];
  durationMs: number;
  rawOutput: string;
  success: boolean;
}

export type NetworkResult = TcpCheckResult | PingResult | DnsLookupResult | TracerouteResult;
