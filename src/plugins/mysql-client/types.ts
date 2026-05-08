export interface MysqlConnectionFormData {
  id?: string;
  name: string;
  groupName?: string;
  host: string;
  port?: number;
  username: string;
  password?: string;
  defaultDatabase?: string;
  charset?: string;
  sslMode?: string;
  connectTimeout?: number;
}

export interface MysqlConnectionInfo {
  id: string;
  name: string;
  groupName?: string;
  host: string;
  port: number;
  username: string;
  defaultDatabase?: string;
  charset?: string;
  sslMode?: string;
  connectTimeout: number;
  createdAt: string;
}

export interface MysqlLatency { millis: number; serverVersion?: string }
export interface MysqlDatabaseInfo { name: string }
export interface MysqlTableInfo { name: string; tableType: string }
export interface MysqlColumnInfo { name: string; columnType: string; nullable: boolean; key: string; defaultValue?: string; extra: string }
export interface MysqlTableStatus { name: string; engine?: string; rows?: number; dataLength?: number; indexLength?: number; collation?: string }
export interface MysqlRowPage { columns: string[]; rows: Record<string, unknown>[]; total: number }
export interface MysqlSqlResult { columns: string[]; rows: Record<string, unknown>[]; affectedRows: number; lastInsertId?: number; message: string }
export interface MysqlIndexInfo { name: string; columns: string[]; unique: boolean; indexType?: string; cardinality?: number }
export interface MysqlQueryHistoryItem { id: string; connectionId: string; database?: string; sql: string; executedAt: string }
export interface MysqlImportResult { successCount: number; failedCount: number; errors: string[] }
export interface MysqlServerStatus { version?: string; status: Record<string, string> }
