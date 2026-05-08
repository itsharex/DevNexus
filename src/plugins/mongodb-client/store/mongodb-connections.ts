import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type {
  MongoCollectionInfo,
  MongoCollectionStats,
  MongoConnectionFormData,
  MongoConnectionInfo,
  MongoDatabaseInfo,
  MongoDocumentPage,
  MongoImportResult,
  MongoIndexInfo,
  MongoLatency,
  MongoQueryHistoryItem,
  MongoServerStatus,
} from "@/plugins/mongodb-client/types";

type MongoWorkspaceTab =
  | "connections"
  | "databases"
  | "documents"
  | "query"
  | "indexes"
  | "importExport"
  | "server";

interface MongoConnectionsState {
  workspaceTab: MongoWorkspaceTab;
  connections: MongoConnectionInfo[];
  connectedIds: string[];
  activeConnId: string | null;
  activeDatabase: string | null;
  activeCollection: string | null;
  databases: MongoDatabaseInfo[];
  collections: MongoCollectionInfo[];
  collectionStats: MongoCollectionStats | null;
  documents: string[];
  documentTotal: number;
  indexes: MongoIndexInfo[];
  history: MongoQueryHistoryItem[];
  serverStatus: MongoServerStatus | null;
  loading: boolean;
  setWorkspaceTab: (tab: MongoWorkspaceTab) => void;
  setActiveNamespace: (database: string | null, collection?: string | null) => void;
  fetchConnections: () => Promise<void>;
  saveConnection: (form: MongoConnectionFormData) => Promise<string>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (form: MongoConnectionFormData) => Promise<MongoLatency>;
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  listDatabases: () => Promise<void>;
  listCollections: (database?: string) => Promise<void>;
  getCollectionStats: (database?: string, collection?: string) => Promise<void>;
  createCollection: (database: string, collection: string) => Promise<void>;
  dropCollection: (database: string, collection: string) => Promise<void>;
  findDocuments: (args?: {
    filterJson?: string;
    projectionJson?: string;
    sortJson?: string;
    skip?: number;
    limit?: number;
  }) => Promise<MongoDocumentPage>;
  insertDocument: (documentJson: string) => Promise<string>;
  updateDocument: (idJson: string, documentJson: string) => Promise<number>;
  deleteDocuments: (filterJson: string) => Promise<number>;
  runAggregate: (pipelineJson: string) => Promise<string[]>;
  runCommand: (database: string, commandJson: string) => Promise<string>;
  listIndexes: () => Promise<void>;
  createIndex: (keysJson: string, optionsJson?: string) => Promise<string>;
  dropIndex: (indexName: string) => Promise<void>;
  exportDocuments: (filterJson?: string, format?: "json" | "jsonl") => Promise<string>;
  pickImportFile: () => Promise<string | null>;
  previewImportFile: (filePath: string, count?: number) => Promise<string[]>;
  importDocuments: (filePath: string, mode: string) => Promise<MongoImportResult>;
  listHistory: () => Promise<void>;
  loadServerStatus: () => Promise<void>;
}

function requireConn(state: MongoConnectionsState): string {
  if (!state.activeConnId) throw new Error("Connect to MongoDB first.");
  return state.activeConnId;
}

function requireNamespace(state: MongoConnectionsState): { connId: string; database: string; collection: string } {
  const connId = requireConn(state);
  if (!state.activeDatabase || !state.activeCollection) {
    throw new Error("Select database and collection first.");
  }
  return {
    connId,
    database: state.activeDatabase,
    collection: state.activeCollection,
  };
}

export const useMongoConnectionsStore = create<MongoConnectionsState>()((set, get) => ({
  workspaceTab: "connections",
  connections: [],
  connectedIds: [],
  activeConnId: null,
  activeDatabase: null,
  activeCollection: null,
  databases: [],
  collections: [],
  collectionStats: null,
  documents: [],
  documentTotal: 0,
  indexes: [],
  history: [],
  serverStatus: null,
  loading: false,
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
  setActiveNamespace: (activeDatabase, activeCollection = null) =>
    set({
      activeDatabase,
      activeCollection,
      collections: activeDatabase ? get().collections : [],
      documents: activeCollection ? get().documents : [],
      documentTotal: activeCollection ? get().documentTotal : 0,
      indexes: activeCollection ? get().indexes : [],
      collectionStats: activeCollection ? get().collectionStats : null,
    }),
  fetchConnections: async () => {
    set({ loading: true });
    try {
      const connections = await invoke<MongoConnectionInfo[]>("cmd_mongo_list_connections");
      set({ connections });
    } finally {
      set({ loading: false });
    }
  },
  saveConnection: async (form) => {
    const id = await invoke<string>("cmd_mongo_save_connection", { form });
    const connections = await invoke<MongoConnectionInfo[]>("cmd_mongo_list_connections");
    set({ connections });
    return id;
  },
  deleteConnection: async (id) => {
    await invoke("cmd_mongo_delete_connection", { id });
    set((state) => ({
      connections: state.connections.filter((item) => item.id !== id),
      connectedIds: state.connectedIds.filter((item) => item !== id),
      activeConnId: state.activeConnId === id ? null : state.activeConnId,
    }));
  },
  testConnection: async (form) => invoke<MongoLatency>("cmd_mongo_test_connection", { form }),
  connect: async (id) => {
    await invoke("cmd_mongo_connect", { id });
    set((state) => ({
      connectedIds: [...new Set([...state.connectedIds, id])],
      activeConnId: id,
      workspaceTab: "databases",
      activeDatabase: null,
      activeCollection: null,
      databases: [],
      collections: [],
      documents: [],
      indexes: [],
    }));
    await get().listDatabases();
  },
  disconnect: async (id) => {
    await invoke("cmd_mongo_disconnect", { id });
    set((state) => ({
      connectedIds: state.connectedIds.filter((item) => item !== id),
      activeConnId: state.activeConnId === id ? null : state.activeConnId,
    }));
  },
  listDatabases: async () => {
    const connId = requireConn(get());
    const databases = await invoke<MongoDatabaseInfo[]>("cmd_mongo_list_databases", { connId });
    set({ databases });
  },
  listCollections: async (database) => {
    const state = get();
    const connId = requireConn(state);
    const databaseName = database ?? state.activeDatabase;
    if (!databaseName) throw new Error("Select database first.");
    const collections = await invoke<MongoCollectionInfo[]>("cmd_mongo_list_collections", {
      connId,
      database: databaseName,
    });
    set({ activeDatabase: databaseName, collections });
  },
  getCollectionStats: async (database, collection) => {
    const state = get();
    const connId = requireConn(state);
    const databaseName = database ?? state.activeDatabase;
    const collectionName = collection ?? state.activeCollection;
    if (!databaseName || !collectionName) return;
    const collectionStats = await invoke<MongoCollectionStats>("cmd_mongo_get_collection_stats", {
      connId,
      database: databaseName,
      collection: collectionName,
    });
    set({ collectionStats });
  },
  createCollection: async (database, collection) => {
    await invoke("cmd_mongo_create_collection", { connId: requireConn(get()), database, collection });
    await get().listCollections(database);
  },
  dropCollection: async (database, collection) => {
    await invoke("cmd_mongo_drop_collection", { connId: requireConn(get()), database, collection });
    await get().listCollections(database);
  },
  findDocuments: async (args = {}) => {
    const ns = requireNamespace(get());
    const page = await invoke<MongoDocumentPage>("cmd_mongo_run_find_query", { ...ns, ...args });
    set({ documents: page.documents, documentTotal: page.total });
    return page;
  },
  insertDocument: async (documentJson) => {
    const id = await invoke<string>("cmd_mongo_insert_document", {
      ...requireNamespace(get()),
      documentJson,
    });
    await get().findDocuments();
    return id;
  },
  updateDocument: async (idJson, documentJson) => {
    const count = await invoke<number>("cmd_mongo_update_document", {
      ...requireNamespace(get()),
      idJson,
      documentJson,
    });
    await get().findDocuments();
    return count;
  },
  deleteDocuments: async (filterJson) => {
    const count = await invoke<number>("cmd_mongo_delete_documents", {
      ...requireNamespace(get()),
      filterJson,
    });
    await get().findDocuments();
    return count;
  },
  runAggregate: async (pipelineJson) =>
    invoke<string[]>("cmd_mongo_run_aggregate", {
      ...requireNamespace(get()),
      pipelineJson,
    }),
  runCommand: async (database, commandJson) =>
    invoke<string>("cmd_mongo_run_database_command", {
      connId: requireConn(get()),
      database,
      commandJson,
    }),
  listIndexes: async () => {
    const indexes = await invoke<MongoIndexInfo[]>("cmd_mongo_list_indexes", requireNamespace(get()));
    set({ indexes });
  },
  createIndex: async (keysJson, optionsJson) => {
    const name = await invoke<string>("cmd_mongo_create_index", {
      ...requireNamespace(get()),
      keysJson,
      optionsJson,
    });
    await get().listIndexes();
    return name;
  },
  dropIndex: async (indexName) => {
    await invoke("cmd_mongo_drop_index", { ...requireNamespace(get()), indexName });
    await get().listIndexes();
  },
  exportDocuments: async (filterJson, format = "json") =>
    invoke<string>("cmd_mongo_export_documents", {
      ...requireNamespace(get()),
      filterJson,
      format,
    }),
  pickImportFile: async () => invoke<string | null>("cmd_mongo_pick_import_file"),
  previewImportFile: async (filePath, count = 20) =>
    invoke<string[]>("cmd_mongo_preview_import_file", { filePath, count }),
  importDocuments: async (filePath, mode) => {
    const result = await invoke<MongoImportResult>("cmd_mongo_import_documents", {
      ...requireNamespace(get()),
      filePath,
      mode,
    });
    await get().findDocuments();
    return result;
  },
  listHistory: async () => {
    const history = await invoke<MongoQueryHistoryItem[]>("cmd_mongo_list_query_history", {
      connectionId: get().activeConnId,
      limit: 50,
    });
    set({ history });
  },
  loadServerStatus: async () => {
    const connId = requireConn(get());
    const serverStatus = await invoke<MongoServerStatus>("cmd_mongo_get_server_status", { connId });
    set({ serverStatus });
  },
}));
