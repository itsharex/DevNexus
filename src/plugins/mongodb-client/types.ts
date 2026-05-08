export type MongoConnectionMode = "uri" | "form";

export interface MongoConnectionFormData {
  id?: string;
  name: string;
  groupName?: string;
  mode: MongoConnectionMode;
  uri?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  authDatabase?: string;
  defaultDatabase?: string;
  replicaSet?: string;
  tls?: boolean;
  srv?: boolean;
}

export interface MongoConnectionInfo {
  id: string;
  name: string;
  groupName?: string;
  mode: MongoConnectionMode;
  host?: string;
  port: number;
  username?: string;
  authDatabase?: string;
  defaultDatabase?: string;
  replicaSet?: string;
  tls: boolean;
  srv: boolean;
  createdAt: string;
}

export interface MongoLatency {
  millis: number;
  serverVersion?: string;
}

export interface MongoDatabaseInfo {
  name: string;
  sizeOnDisk: number;
  empty: boolean;
}

export interface MongoCollectionInfo {
  name: string;
  collectionType: string;
}

export interface MongoCollectionStats {
  count: number;
  size: number;
  storageSize: number;
  totalIndexSize: number;
  avgObjSize?: number;
}

export interface MongoDocumentPage {
  documents: string[];
  total: number;
}

export interface MongoIndexInfo {
  name: string;
  keysJson: string;
  unique: boolean;
  sparse: boolean;
  expireAfterSeconds?: number;
}

export interface MongoQueryHistoryItem {
  id: string;
  connectionId: string;
  database?: string;
  collection?: string;
  queryType: string;
  content: string;
  executedAt: string;
}

export interface MongoImportResult {
  successCount: number;
  failedCount: number;
  errors: string[];
}

export interface MongoServerStatus {
  version?: string;
  connections: Record<string, string>;
  memory: Record<string, string>;
  opcounters: Record<string, string>;
}
