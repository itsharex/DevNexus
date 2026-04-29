import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type {
  SshConnectionFormData,
  SshConnectionInfo,
  SshLatency,
} from "@/plugins/ssh-client/types";

interface SshConnectionsState {
  connections: SshConnectionInfo[];
  connectedIds: string[];
  loading: boolean;
  fetchConnections: () => Promise<void>;
  saveConnection: (form: SshConnectionFormData) => Promise<string>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (form: SshConnectionFormData) => Promise<SshLatency>;
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
}

let closedEventRegistered = false;

export const useSshConnectionsStore = create<SshConnectionsState>()((set) => ({
  connections: [],
  connectedIds: [],
  loading: false,
  fetchConnections: async () => {
    if (!closedEventRegistered) {
      await listen<string>("ssh://session-closed", (event) => {
        const id = event.payload;
        set((state) => ({
          connectedIds: state.connectedIds.filter((item) => item !== id),
        }));
      });
      closedEventRegistered = true;
    }
    set({ loading: true });
    try {
      const connections = await invoke<SshConnectionInfo[]>("cmd_ssh_list_connections");
      set({ connections });
    } finally {
      set({ loading: false });
    }
  },
  saveConnection: async (form) => {
    const id = await invoke<string>("cmd_ssh_save_connection", { form });
    const connections = await invoke<SshConnectionInfo[]>("cmd_ssh_list_connections");
    set({ connections });
    return id;
  },
  deleteConnection: async (id) => {
    await invoke("cmd_ssh_delete_connection", { id });
    set((state) => ({
      connections: state.connections.filter((item) => item.id !== id),
      connectedIds: state.connectedIds.filter((item) => item !== id),
    }));
  },
  testConnection: (form) =>
    invoke<SshLatency>("cmd_ssh_test_connection", {
      form,
    }),
  connect: async (id) => {
    await invoke("cmd_ssh_connect", { id });
    set((state) => ({
      connectedIds: [...new Set([...state.connectedIds, id])],
    }));
  },
  disconnect: async (id) => {
    await invoke("cmd_ssh_disconnect", { id });
    set((state) => ({
      connectedIds: state.connectedIds.filter((item) => item !== id),
    }));
  },
}));
