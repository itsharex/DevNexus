export interface ConfluenceConnectionInfo {
  id: string;
  label: string;
  baseUrl: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConfluenceConnectionForm {
  id?: string;
  label: string;
  baseUrl: string;
  username: string;
  password: string;
}

export interface ConfluenceTestResult {
  success: boolean;
  durationMs: number;
  error?: string | null;
}

export interface SpaceInfo {
  key: string;
  name: string;
}

export interface PageInfo {
  id: string;
  title: string;
  version: number;
  spaceKey: string;
}

export interface AttachmentInfo {
  id: string;
  title: string;
  downloadUrl: string;
}

export interface FilePageMapping {
  filePath: string;
  spaceKey: string;
  pageId: string;
  pageTitle: string;
  version: number;
  lastPublished: string;
}
