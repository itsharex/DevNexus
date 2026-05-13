import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type { NetworkHistoryItem, NetworkResult, NetworkToolType } from "@/plugins/network-tools/types";

export type NetworkWorkspaceTab = "diagnostics" | "history";

interface NetworkState {
  workspaceTab: NetworkWorkspaceTab;
  activeTool: NetworkToolType;
  lastResult: NetworkResult | null;
  history: NetworkHistoryItem[];
  loading: boolean;
  setWorkspaceTab: (tab: NetworkWorkspaceTab) => void;
  setActiveTool: (tool: NetworkToolType) => void;
  tcpCheck: (host: string, port: number, timeoutMs?: number) => Promise<NetworkResult>;
  ping: (target: string, count?: number, timeoutMs?: number) => Promise<NetworkResult>;
  dnsLookup: (host: string, recordType?: string, timeoutMs?: number) => Promise<NetworkResult>;
  traceroute: (target: string, maxHops?: number, timeoutMs?: number) => Promise<NetworkResult>;
  fetchHistory: () => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  rerunHistory: (item: NetworkHistoryItem) => Promise<NetworkResult>;
}

function parseParams(item: NetworkHistoryItem): Record<string, unknown> {
  try {
    return JSON.parse(item.paramsJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const useNetworkToolsStore = create<NetworkState>()((set, get) => ({
  workspaceTab: "diagnostics",
  activeTool: "tcp",
  lastResult: null,
  history: [],
  loading: false,
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
  setActiveTool: (activeTool) => set({ activeTool }),
  tcpCheck: async (host, port, timeoutMs = 5_000) => {
    set({ loading: true });
    try {
      const result = await invoke<NetworkResult>("cmd_network_tcp_check", { host, port, timeoutMs });
      set({ lastResult: result });
      await get().fetchHistory();
      return result;
    } finally { set({ loading: false }); }
  },
  ping: async (target, count = 4, timeoutMs = 5_000) => {
    set({ loading: true });
    try {
      const result = await invoke<NetworkResult>("cmd_network_ping", { target, count, timeoutMs });
      set({ lastResult: result });
      await get().fetchHistory();
      return result;
    } finally { set({ loading: false }); }
  },
  dnsLookup: async (host, recordType = "A/AAAA", timeoutMs = 5_000) => {
    set({ loading: true });
    try {
      const result = await invoke<NetworkResult>("cmd_network_dns_lookup", { host, recordType, timeoutMs });
      set({ lastResult: result });
      await get().fetchHistory();
      return result;
    } finally { set({ loading: false }); }
  },
  traceroute: async (target, maxHops = 30, timeoutMs = 5_000) => {
    set({ loading: true });
    try {
      const result = await invoke<NetworkResult>("cmd_network_traceroute", { target, maxHops, timeoutMs });
      set({ lastResult: result });
      await get().fetchHistory();
      return result;
    } finally { set({ loading: false }); }
  },
  fetchHistory: async () => set({ history: await invoke<NetworkHistoryItem[]>("cmd_network_list_history", { limit: 100 }) }),
  deleteHistory: async (id) => {
    await invoke("cmd_network_delete_history", { id });
    await get().fetchHistory();
  },
  clearHistory: async () => {
    await invoke("cmd_network_clear_history");
    set({ history: [] });
  },
  rerunHistory: async (item) => {
    const params = parseParams(item);
    set({ activeTool: item.toolType, workspaceTab: "diagnostics" });
    if (item.toolType === "tcp") return get().tcpCheck(String(params.host ?? item.target), Number(params.port ?? 80), Number(params.timeoutMs ?? 5_000));
    if (item.toolType === "ping") return get().ping(String(params.target ?? item.target), Number(params.count ?? 4), Number(params.timeoutMs ?? 5_000));
    if (item.toolType === "dns") return get().dnsLookup(String(params.host ?? item.target), String(params.recordType ?? "A/AAAA"), Number(params.timeoutMs ?? 5_000));
    if (item.toolType === "traceroute") return get().traceroute(String(params.target ?? item.target), Number(params.maxHops ?? 30), Number(params.timeoutMs ?? 5_000));
    return get().tcpCheck(String(params.host ?? item.target), Number(params.port ?? 80), Number(params.timeoutMs ?? 5_000));
  },
}));
