import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type {
  MqConnectionDiagnostics,
  MqConnectionFormData,
  MqConnectionInfo,
  MqConsumeRequest,
  MqHistoryFilter,
  MqHistoryItem,
  MqOperationResult,
  MqPublishRequest,
  MqResourceNode,
  MqSavedMessage,
  MqSavedMessageFormData,
  MqTab,
} from "@/plugins/mq-client/types";

interface MqState {
  tab: MqTab;
  connections: MqConnectionInfo[];
  activeConnId: string | null;
  resources: MqResourceNode[];
  history: MqHistoryItem[];
  templates: MqSavedMessage[];
  lastDiagnostics: MqConnectionDiagnostics | null;
  lastResult: MqOperationResult | null;
  loading: boolean;
  setTab: (tab: MqTab) => void;
  fetchConnections: () => Promise<void>;
  saveConnection: (form: MqConnectionFormData) => Promise<string>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<MqConnectionDiagnostics>;
  connect: (id: string) => Promise<void>;
  browse: () => Promise<void>;
  publish: (request: MqPublishRequest) => Promise<MqOperationResult>;
  consumePreview: (request: MqConsumeRequest) => Promise<MqOperationResult>;
  fetchHistory: (filter?: MqHistoryFilter) => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  fetchTemplates: (brokerType?: string) => Promise<void>;
  saveTemplate: (form: MqSavedMessageFormData) => Promise<string>;
  deleteTemplate: (id: string) => Promise<void>;
}

function activeConnection(state: MqState): MqConnectionInfo {
  const connection = state.connections.find((item) => item.id === state.activeConnId);
  if (!connection) throw new Error("Connect to RabbitMQ or Kafka first.");
  return connection;
}

export const useMqStore = create<MqState>()((set, get) => ({
  tab: "connections",
  connections: [],
  activeConnId: null,
  resources: [],
  history: [],
  templates: [],
  lastDiagnostics: null,
  lastResult: null,
  loading: false,
  setTab: (tab) => set({ tab }),
  fetchConnections: async () => set({ connections: await invoke<MqConnectionInfo[]>("cmd_mq_list_connections") }),
  saveConnection: async (form) => {
    const id = await invoke<string>("cmd_mq_save_connection", { form });
    await get().fetchConnections();
    return id;
  },
  deleteConnection: async (id) => {
    await invoke("cmd_mq_delete_connection", { id });
    set((state) => ({ connections: state.connections.filter((item) => item.id !== id), activeConnId: state.activeConnId === id ? null : state.activeConnId }));
  },
  testConnection: async (id) => {
    const result = await invoke<MqConnectionDiagnostics>("cmd_mq_test_connection", { id });
    set({ lastDiagnostics: result });
    return result;
  },
  connect: async (id) => {
    set({ activeConnId: id, tab: "browser" });
    await get().browse();
    await get().fetchHistory();
  },
  browse: async () => set({ resources: await invoke<MqResourceNode[]>("cmd_mq_browse", { connId: activeConnection(get()).id }) }),
  publish: async (request) => {
    const result = await invoke<MqOperationResult>("cmd_mq_publish", { request });
    set({ lastResult: result });
    await get().fetchHistory();
    return result;
  },
  consumePreview: async (request) => {
    const result = await invoke<MqOperationResult>("cmd_mq_consume_preview", { request });
    set({ lastResult: result });
    await get().fetchHistory();
    return result;
  },
  fetchHistory: async (filter) => set({ history: await invoke<MqHistoryItem[]>("cmd_mq_list_history", { filter }) }),
  deleteHistory: async (id) => { await invoke("cmd_mq_delete_history", { id }); await get().fetchHistory(); },
  clearHistory: async () => { await invoke("cmd_mq_clear_history"); set({ history: [] }); },
  fetchTemplates: async (brokerType) => set({ templates: await invoke<MqSavedMessage[]>("cmd_mq_list_saved_messages", { brokerType }) }),
  saveTemplate: async (form) => { const id = await invoke<string>("cmd_mq_save_message_template", { form }); await get().fetchTemplates(form.brokerType); return id; },
  deleteTemplate: async (id) => { await invoke("cmd_mq_delete_message_template", { id }); set((state) => ({ templates: state.templates.filter((item) => item.id !== id) })); },
}));
