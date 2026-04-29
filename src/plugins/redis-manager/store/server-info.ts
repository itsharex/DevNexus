import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

import type { ServerInfo, SlowlogEntry } from "@/plugins/redis-manager/types";

interface ServerInfoState {
  info: ServerInfo | null;
  slowlogs: SlowlogEntry[];
  dbSize: Record<string, number>;
  memorySeries: number[];
  opsSeries: number[];
  loading: boolean;
  refresh: (connId: string) => Promise<void>;
}

export const useServerInfoStore = create<ServerInfoState>()((set) => ({
  info: null,
  slowlogs: [],
  dbSize: {},
  memorySeries: [],
  opsSeries: [],
  loading: false,
  refresh: async (connId) => {
    set({ loading: true });
    try {
      const [info, slowlogs, dbSize] = await Promise.all([
        invoke<ServerInfo>("cmd_get_server_info", { connId }),
        invoke<SlowlogEntry[]>("cmd_get_slowlog", { connId, count: 50 }),
        invoke<Record<string, number>>("cmd_get_dbsize", { connId }),
      ]);
      const usedMemory = Number(info.memory?.used_memory ?? 0);
      const ops = Number(info.stats?.instantaneous_ops_per_sec ?? 0);
      set((state) => ({
        info,
        slowlogs,
        dbSize,
        memorySeries: [...state.memorySeries, usedMemory].slice(-60),
        opsSeries: [...state.opsSeries, ops].slice(-60),
      }));
    } finally {
      set({ loading: false });
    }
  },
}));
