import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

import type {
  ConnectionFormData,
  ConnectionInfo,
  RedisLatency,
  RedisServerInfo,
} from "@/plugins/redis-manager/types";

interface ConnectionsState {
  connections: ConnectionInfo[];
  connectedIds: string[];
  serverInfoById: Record<string, RedisServerInfo>;
  latencyById: Record<string, number>;
  loading: boolean;
  fetchConnections: () => Promise<void>;
  saveConnection: (connection: ConnectionFormData) => Promise<string>;
  removeConnection: (id: string) => Promise<void>;
  testConnection: (form: ConnectionFormData) => Promise<RedisLatency>;
  connect: (id: string) => Promise<RedisServerInfo>;
  disconnect: (id: string) => Promise<void>;
  selectDb: (id: string, dbIndex: number) => Promise<void>;
  setConnected: (id: string, connected: boolean) => void;
}

export const useConnectionsStore = create<ConnectionsState>()((set) => ({
  connections: [],
  connectedIds: [],
  serverInfoById: {},
  latencyById: {},
  loading: false,
  fetchConnections: async () => {
    set({ loading: true });
    try {
      const connections = await invoke<ConnectionInfo[]>("cmd_list_connections");
      set({ connections });
    } finally {
      set({ loading: false });
    }
  },
  saveConnection: async (connection) => {
    const id = await invoke<string>("cmd_save_connection", { form: connection });
    const connections = await invoke<ConnectionInfo[]>("cmd_list_connections");
    set({ connections });
    return id;
  },
  removeConnection: async (id) => {
    await invoke("cmd_delete_connection", { id });
    set((state) => ({
      connections: state.connections.filter((item) => item.id !== id),
      connectedIds: state.connectedIds.filter((item) => item !== id),
    }));
  },
  testConnection: (form) =>
    invoke<RedisLatency>("cmd_test_connection", {
      form,
    }),
  connect: async (id) => {
    const info = await invoke<RedisServerInfo>("cmd_connect", { id });
    set((state) => ({
      connectedIds: [...new Set([...state.connectedIds, id])],
      serverInfoById: {
        ...state.serverInfoById,
        [id]: info,
      },
    }));
    return info;
  },
  disconnect: async (id) => {
    await invoke("cmd_disconnect", { id });
    set((state) => ({
      connectedIds: state.connectedIds.filter((item) => item !== id),
      serverInfoById: Object.fromEntries(
        Object.entries(state.serverInfoById).filter(([key]) => key !== id),
      ),
    }));
  },
  selectDb: async (id, dbIndex) => {
    await invoke("cmd_select_db", { connId: id, dbIndex });
    const connections = await invoke<ConnectionInfo[]>("cmd_list_connections");
    set({ connections });
  },
  setConnected: (id, connected) =>
    set((state) => ({
      connectedIds: connected
        ? [...new Set([...state.connectedIds, id])]
        : state.connectedIds.filter((item) => item !== id),
    })),
}));
