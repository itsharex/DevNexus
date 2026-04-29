import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

import type { TunnelRule, TunnelRuleForm, TunnelStartForm } from "@/plugins/ssh-client/types";

interface TunnelsState {
  rules: TunnelRule[];
  loading: boolean;
  fetchRules: (connId: string) => Promise<void>;
  saveRule: (form: TunnelRuleForm) => Promise<string>;
  deleteRule: (id: string, connId: string) => Promise<void>;
  startRule: (rule: TunnelRule) => Promise<void>;
  stopRule: (ruleId: string, connId: string) => Promise<void>;
}

function toStartForm(rule: TunnelRule): TunnelStartForm {
  return {
    ruleId: rule.id,
    connectionId: rule.connectionId,
    localHost: rule.localHost,
    localPort: rule.localPort,
    remoteHost: rule.remoteHost,
    remotePort: rule.remotePort,
  };
}

export const useSshTunnelsStore = create<TunnelsState>()((set, get) => ({
  rules: [],
  loading: false,
  fetchRules: async (connId) => {
    set({ loading: true });
    try {
      const rules = await invoke<TunnelRule[]>("cmd_tunnel_list_rules", { connId });
      set({ rules });
    } finally {
      set({ loading: false });
    }
  },
  saveRule: async (form) => {
    const id = await invoke<string>("cmd_tunnel_save_rule", { form });
    await get().fetchRules(form.connectionId);
    return id;
  },
  deleteRule: async (id, connId) => {
    await invoke("cmd_tunnel_delete_rule", { id });
    await get().fetchRules(connId);
  },
  startRule: async (rule) => {
    const form = toStartForm(rule);
    if (rule.tunnelType === "local") {
      await invoke("cmd_tunnel_start_local", { form });
    } else if (rule.tunnelType === "remote") {
      await invoke("cmd_tunnel_start_remote", { form });
    } else {
      await invoke("cmd_tunnel_start_dynamic", { form });
    }
    await get().fetchRules(rule.connectionId);
  },
  stopRule: async (ruleId, connId) => {
    await invoke("cmd_tunnel_stop", { ruleId });
    await get().fetchRules(connId);
  },
}));
