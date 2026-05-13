export interface ApiKeyValue {
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
}

export interface ApiAuthConfig {
  authType: "none" | "basic" | "bearer" | "apiKey";
  username?: string;
  password?: string;
  token?: string;
  key?: string;
  value?: string;
  addTo?: "header" | "query";
}

export interface ApiBodyConfig {
  bodyType: "none" | "raw" | "json" | "xml" | "form" | "multipart" | "binary";
  raw?: string;
  form?: ApiKeyValue[];
  multipart?: ApiKeyValue[];
  binaryPath?: string;
  contentType?: string;
}

export interface ApiSendRequest {
  requestId?: string;
  method: string;
  url: string;
  params: ApiKeyValue[];
  headers: ApiKeyValue[];
  cookies: ApiKeyValue[];
  auth?: ApiAuthConfig | null;
  body?: ApiBodyConfig | null;
  timeoutMs?: number;
  followRedirects?: boolean;
  validateSsl?: boolean;
  environmentId?: string | null;
  saveHistory?: boolean;
}

export interface ApiResolvedPreview {
  url: string;
  headers: ApiKeyValue[];
  cookies: ApiKeyValue[];
  bodyPreview?: string;
  missingVariables: string[];
}

export interface ApiResponseData {
  status?: number;
  statusText?: string;
  durationMs: number;
  sizeBytes: number;
  headers: ApiKeyValue[];
  cookies: ApiKeyValue[];
  body: string;
  bodyTruncated: boolean;
  contentType?: string;
  redirectChain: string[];
  error?: string;
  timing: { totalMs: number };
}

export interface ApiCollection { id: string; name: string; description?: string; createdAt: string; updatedAt: string; }
export interface ApiFolder { id: string; collectionId: string; parentId?: string | null; name: string; sortOrder: number; createdAt: string; updatedAt: string; }
export interface ApiEnvironment { id: string; name: string; variables: ApiKeyValue[]; createdAt: string; updatedAt: string; }

export interface ApiSavedRequest {
  id: string;
  collectionId?: string;
  folderId?: string;
  name: string;
  method: string;
  url: string;
  paramsJson: string;
  headersJson: string;
  cookiesJson: string;
  authJson: string;
  bodyJson: string;
  timeoutMs: number;
  followRedirects: boolean;
  validateSsl: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiHistoryItem {
  id: string;
  method: string;
  url: string;
  host: string;
  status: string;
  statusCode?: number;
  durationMs: number;
  requestJson: string;
  responseJson: string;
  createdAt: string;
}

export interface ApiHistoryFilter { method?: string; host?: string; status?: string; limit?: number; }

export type ApiWorkspaceTab = "workspace" | "collections" | "environments" | "history";
