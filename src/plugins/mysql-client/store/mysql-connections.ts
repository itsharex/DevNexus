import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type {
  MysqlColumnInfo,
  MysqlConnectionFormData,
  MysqlConnectionInfo,
  MysqlDatabaseInfo,
  MysqlImportResult,
  MysqlIndexInfo,
  MysqlLatency,
  MysqlQueryHistoryItem,
  MysqlRowPage,
  MysqlServerStatus,
  MysqlSqlResult,
  MysqlTableInfo,
  MysqlTableStatus,
} from "@/plugins/mysql-client/types";

export type MysqlWorkspaceTab = "connections" | "databases" | "tableData" | "sql" | "indexes" | "importExport" | "server";

interface MysqlState {
  workspaceTab: MysqlWorkspaceTab;
  connections: MysqlConnectionInfo[];
  connectedIds: string[];
  activeConnId: string | null;
  activeDatabase: string | null;
  activeTable: string | null;
  databases: MysqlDatabaseInfo[];
  tables: MysqlTableInfo[];
  columns: MysqlColumnInfo[];
  tableStatus: MysqlTableStatus | null;
  rowPage: MysqlRowPage;
  indexes: MysqlIndexInfo[];
  history: MysqlQueryHistoryItem[];
  serverStatus: MysqlServerStatus | null;
  loading: boolean;
  setWorkspaceTab: (tab: MysqlWorkspaceTab) => void;
  fetchConnections: () => Promise<void>;
  saveConnection: (form: MysqlConnectionFormData) => Promise<string>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (form: MysqlConnectionFormData) => Promise<MysqlLatency>;
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  listDatabases: () => Promise<void>;
  listTables: (database?: string) => Promise<void>;
  selectTable: (database: string, table: string) => Promise<void>;
  loadRows: (offset?: number, limit?: number) => Promise<MysqlRowPage>;
  insertRow: (rowJson: string) => Promise<number>;
  updateRow: (pkJson: string, rowJson: string) => Promise<number>;
  deleteRow: (pkJson: string) => Promise<number>;
  executeSql: (sql: string, database?: string) => Promise<MysqlSqlResult>;
  listHistory: () => Promise<void>;
  listIndexes: () => Promise<void>;
  createIndex: (indexName: string, columns: string[], unique?: boolean) => Promise<void>;
  dropIndex: (indexName: string) => Promise<void>;
  exportRows: (format?: "json" | "csv") => Promise<string>;
  pickImportFile: () => Promise<string | null>;
  previewImportFile: (filePath: string, count?: number) => Promise<Record<string, unknown>[]>;
  importRows: (filePath: string, mode: string) => Promise<MysqlImportResult>;
  loadServerStatus: () => Promise<void>;
}

const emptyPage: MysqlRowPage = { columns: [], rows: [], total: 0 };

function requireConn(state: MysqlState): string {
  if (!state.activeConnId) throw new Error("Connect to MySQL first.");
  return state.activeConnId;
}

function requireTable(state: MysqlState): { connId: string; database: string; table: string } {
  const connId = requireConn(state);
  if (!state.activeDatabase || !state.activeTable) throw new Error("Select database and table first.");
  return { connId, database: state.activeDatabase, table: state.activeTable };
}

export const useMysqlConnectionsStore = create<MysqlState>()((set, get) => ({
  workspaceTab: "connections",
  connections: [],
  connectedIds: [],
  activeConnId: null,
  activeDatabase: null,
  activeTable: null,
  databases: [],
  tables: [],
  columns: [],
  tableStatus: null,
  rowPage: emptyPage,
  indexes: [],
  history: [],
  serverStatus: null,
  loading: false,
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
  fetchConnections: async () => {
    set({ loading: true });
    try { set({ connections: await invoke<MysqlConnectionInfo[]>("cmd_mysql_list_connections") }); }
    finally { set({ loading: false }); }
  },
  saveConnection: async (form) => {
    const id = await invoke<string>("cmd_mysql_save_connection", { form });
    set({ connections: await invoke<MysqlConnectionInfo[]>("cmd_mysql_list_connections") });
    return id;
  },
  deleteConnection: async (id) => {
    await invoke("cmd_mysql_delete_connection", { id });
    set((state) => ({ connections: state.connections.filter((item) => item.id !== id), connectedIds: state.connectedIds.filter((item) => item !== id), activeConnId: state.activeConnId === id ? null : state.activeConnId }));
  },
  testConnection: async (form) => invoke<MysqlLatency>("cmd_mysql_test_connection", { form }),
  connect: async (id) => {
    await invoke("cmd_mysql_connect", { id });
    set((state) => ({ connectedIds: [...new Set([...state.connectedIds, id])], activeConnId: id, activeDatabase: null, activeTable: null, workspaceTab: "databases", tables: [], columns: [], rowPage: emptyPage, indexes: [] }));
    await get().listDatabases();
  },
  disconnect: async (id) => {
    await invoke("cmd_mysql_disconnect", { id });
    set((state) => ({ connectedIds: state.connectedIds.filter((item) => item !== id), activeConnId: state.activeConnId === id ? null : state.activeConnId }));
  },
  listDatabases: async () => set({ databases: await invoke<MysqlDatabaseInfo[]>("cmd_mysql_list_databases", { connId: requireConn(get()) }) }),
  listTables: async (database) => {
    const db = database ?? get().activeDatabase;
    if (!db) throw new Error("Select database first.");
    const tables = await invoke<MysqlTableInfo[]>("cmd_mysql_list_tables", { connId: requireConn(get()), database: db });
    set({ activeDatabase: db, activeTable: null, tables, columns: [], tableStatus: null, rowPage: emptyPage });
  },
  selectTable: async (database, table) => {
    const connId = requireConn(get());
    const [columns, tableStatus] = await Promise.all([
      invoke<MysqlColumnInfo[]>("cmd_mysql_describe_table", { connId, database, table }),
      invoke<MysqlTableStatus>("cmd_mysql_get_table_status", { connId, database, table }),
    ]);
    set({ activeDatabase: database, activeTable: table, columns, tableStatus, workspaceTab: "tableData", rowPage: emptyPage });
    await get().loadRows(0, 100);
  },
  loadRows: async (offset = 0, limit = 100) => {
    const page = await invoke<MysqlRowPage>("cmd_mysql_select_rows", { ...requireTable(get()), offset, limit });
    set({ rowPage: page });
    return page;
  },
  insertRow: async (rowJson) => { const count = await invoke<number>("cmd_mysql_insert_row", { ...requireTable(get()), rowJson }); await get().loadRows(); return count; },
  updateRow: async (pkJson, rowJson) => { const count = await invoke<number>("cmd_mysql_update_row", { ...requireTable(get()), pkJson, rowJson }); await get().loadRows(); return count; },
  deleteRow: async (pkJson) => { const count = await invoke<number>("cmd_mysql_delete_row", { ...requireTable(get()), pkJson }); await get().loadRows(); return count; },
  executeSql: async (sql, database) => invoke<MysqlSqlResult>("cmd_mysql_execute_sql", { connId: requireConn(get()), database: database ?? get().activeDatabase, sql }),
  listHistory: async () => set({ history: await invoke<MysqlQueryHistoryItem[]>("cmd_mysql_list_query_history", { connectionId: get().activeConnId, limit: 50 }) }),
  listIndexes: async () => set({ indexes: await invoke<MysqlIndexInfo[]>("cmd_mysql_list_indexes", requireTable(get())) }),
  createIndex: async (indexName, columns, unique) => { await invoke("cmd_mysql_create_index", { ...requireTable(get()), indexName, columns, unique }); await get().listIndexes(); },
  dropIndex: async (indexName) => { await invoke("cmd_mysql_drop_index", { ...requireTable(get()), indexName }); await get().listIndexes(); },
  exportRows: async (format = "json") => invoke<string>("cmd_mysql_export_rows", { ...requireTable(get()), format }),
  pickImportFile: async () => invoke<string | null>("cmd_mysql_pick_import_file"),
  previewImportFile: async (filePath, count = 20) => invoke<Record<string, unknown>[]>("cmd_mysql_preview_import_file", { filePath, count }),
  importRows: async (filePath, mode) => { const result = await invoke<MysqlImportResult>("cmd_mysql_import_rows", { ...requireTable(get()), filePath, mode }); await get().loadRows(); return result; },
  loadServerStatus: async () => set({ serverStatus: await invoke<MysqlServerStatus>("cmd_mysql_get_server_status", { connId: requireConn(get()) }) }),
}));
