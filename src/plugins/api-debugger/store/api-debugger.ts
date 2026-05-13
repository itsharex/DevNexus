import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type { ApiCollection, ApiEnvironment, ApiFolder, ApiHistoryFilter, ApiHistoryItem, ApiResolvedPreview, ApiResponseData, ApiSavedRequest, ApiSendRequest, ApiWorkspaceTab } from "@/plugins/api-debugger/types";
import { defaultRequest, parseHistoryRequest, parseSavedRequest } from "@/plugins/api-debugger/utils/api-debugger";

interface ApiDebuggerState {
  tab: ApiWorkspaceTab;
  activeRequest: ApiSendRequest;
  activeRequestName: string;
  activeSavedRequestId?: string;
  response: ApiResponseData | null;
  preview: ApiResolvedPreview | null;
  collections: ApiCollection[];
  folders: ApiFolder[];
  requests: ApiSavedRequest[];
  environments: ApiEnvironment[];
  activeEnvironmentId?: string;
  history: ApiHistoryItem[];
  loading: boolean;
  setTab: (tab: ApiWorkspaceTab) => void;
  updateRequest: (patch: Partial<ApiSendRequest>) => void;
  newRequest: () => void;
  sendRequest: () => Promise<void>;
  previewRequest: () => Promise<void>;
  cancelRequest: () => Promise<void>;
  saveRequest: (name?: string, collectionId?: string, folderId?: string) => Promise<void>;
  openSavedRequest: (request: ApiSavedRequest) => void;
  openHistory: (item: ApiHistoryItem) => void;
  fetchAll: () => Promise<void>;
  fetchCollections: () => Promise<void>;
  fetchHistory: (filter?: ApiHistoryFilter) => Promise<void>;
  saveCollection: (name: string, description?: string, id?: string) => Promise<string>;
  deleteCollection: (id: string) => Promise<void>;
  saveFolder: (collectionId: string, name: string, parentId?: string, id?: string) => Promise<string>;
  deleteFolder: (id: string) => Promise<void>;
  deleteRequest: (id: string) => Promise<void>;
  saveEnvironment: (name: string, variables: ApiEnvironment["variables"], id?: string) => Promise<string>;
  deleteEnvironment: (id: string) => Promise<void>;
  setActiveEnvironment: (id?: string) => void;
  deleteHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  importCurl: (curl: string) => Promise<void>;
  exportCollection: (collectionId: string, redact?: boolean) => Promise<string>;
}

export const useApiDebuggerStore = create<ApiDebuggerState>()((set, get) => ({
  tab: "workspace",
  activeRequest: defaultRequest(),
  activeRequestName: "Untitled Request",
  response: null,
  preview: null,
  collections: [],
  folders: [],
  requests: [],
  environments: [],
  history: [],
  loading: false,
  setTab: (tab) => set({ tab }),
  updateRequest: (patch) => set((state) => ({ activeRequest: { ...state.activeRequest, ...patch } })),
  newRequest: () => set({ activeRequest: defaultRequest(), activeRequestName: "Untitled Request", activeSavedRequestId: undefined, response: null, preview: null, tab: "workspace" }),
  sendRequest: async () => {
    const request = { ...get().activeRequest, environmentId: get().activeEnvironmentId ?? null };
    set({ loading: true });
    try {
      const response = await invoke<ApiResponseData>("cmd_api_send_request", { request });
      set({ response });
      await get().fetchHistory();
    } finally {
      set({ loading: false });
    }
  },
  previewRequest: async () => {
    const request = { ...get().activeRequest, environmentId: get().activeEnvironmentId ?? null };
    set({ preview: await invoke<ApiResolvedPreview>("cmd_api_preview_request", { request }) });
  },
  cancelRequest: async () => {
    const requestId = get().activeRequest.requestId ?? crypto.randomUUID();
    await invoke("cmd_api_cancel_request", { requestId });
    set({ loading: false });
  },
  saveRequest: async (name, collectionId, folderId) => {
    const state = get();
    const id = await invoke<string>("cmd_api_save_request", { form: { id: state.activeSavedRequestId, name: name || state.activeRequestName, collectionId: collectionId ?? null, folderId: folderId ?? null, request: state.activeRequest } });
    set({ activeSavedRequestId: id, activeRequestName: name || state.activeRequestName });
    await get().fetchAll();
  },
  openSavedRequest: (request) => set({ activeRequest: parseSavedRequest(request), activeRequestName: request.name, activeSavedRequestId: request.id, tab: "workspace", response: null }),
  openHistory: (item) => set({ activeRequest: parseHistoryRequest(item.requestJson), activeRequestName: `${item.method} ${item.host || item.url}`, activeSavedRequestId: undefined, tab: "workspace" }),
  fetchAll: async () => {
    const [collections, folders, requests, environments] = await Promise.all([
      invoke<ApiCollection[]>("cmd_api_list_collections"),
      invoke<ApiFolder[]>("cmd_api_list_folders", { collectionId: null }),
      invoke<ApiSavedRequest[]>("cmd_api_list_requests", { collectionId: null }),
      invoke<ApiEnvironment[]>("cmd_api_list_environments"),
    ]);
    set({ collections, folders, requests, environments });
  },
  fetchCollections: async () => set({ collections: await invoke<ApiCollection[]>("cmd_api_list_collections") }),
  fetchHistory: async (filter) => set({ history: await invoke<ApiHistoryItem[]>("cmd_api_list_history", { filter: filter ?? null }) }),
  saveCollection: async (name, description, id) => {
    const saved = await invoke<string>("cmd_api_save_collection", { id: id ?? null, name, description: description ?? null });
    try {
      await get().fetchAll();
    } catch {
      await get().fetchCollections();
    }
    return saved;
  },
  deleteCollection: async (id) => {
    await invoke("cmd_api_delete_collection", { id });
    try {
      await get().fetchAll();
    } catch {
      await get().fetchCollections();
    }
  },
  saveFolder: async (collectionId, name, parentId, id) => { const saved = await invoke<string>("cmd_api_save_folder", { id: id ?? null, collectionId, parentId: parentId ?? null, name }); await get().fetchAll(); return saved; },
  deleteFolder: async (id) => { await invoke("cmd_api_delete_folder", { id }); await get().fetchAll(); },
  deleteRequest: async (id) => { await invoke("cmd_api_delete_request", { id }); await get().fetchAll(); },
  saveEnvironment: async (name, variables, id) => { const saved = await invoke<string>("cmd_api_save_environment", { id: id ?? null, name, variables }); await get().fetchAll(); return saved; },
  deleteEnvironment: async (id) => { await invoke("cmd_api_delete_environment", { id }); await get().fetchAll(); },
  setActiveEnvironment: (id) => set({ activeEnvironmentId: id }),
  deleteHistory: async (id) => { await invoke("cmd_api_delete_history", { id }); await get().fetchHistory(); },
  clearHistory: async () => { await invoke("cmd_api_clear_history"); set({ history: [] }); },
  importCurl: async (curl) => set({ activeRequest: await invoke<ApiSendRequest>("cmd_api_import_curl", { curl }), activeRequestName: "Imported cURL", tab: "workspace" }),
  exportCollection: async (collectionId, redact = true) => invoke<string>("cmd_api_export_collection_json", { collectionId, redact }),
}));
