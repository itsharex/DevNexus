export type S3Provider = "aws" | "minio" | "aliyun" | "tencent" | "r2" | "custom";

export interface S3ConnectionFormData {
  id?: string;
  name: string;
  groupName?: string;
  provider: S3Provider;
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey?: string;
  pathStyle?: boolean;
  defaultBucket?: string;
}

export interface S3ConnectionInfo {
  id: string;
  name: string;
  groupName?: string;
  provider: S3Provider;
  endpoint?: string;
  region: string;
  accessKeyId: string;
  pathStyle: boolean;
  defaultBucket?: string;
  createdAt: string;
}

export interface S3Latency {
  millis: number;
}

export interface S3BucketInfo {
  name: string;
  creationDate?: string;
  region?: string;
  versioningStatus?: string;
}

export interface S3ObjectItem {
  key: string;
  size: number;
  lastModified?: string;
  etag?: string;
  storageClass?: string;
}

export interface S3ListObjectsResult {
  objects: S3ObjectItem[];
  commonPrefixes: string[];
  nextToken?: string;
  isTruncated: boolean;
}

export interface S3ObjectVersion {
  key: string;
  versionId?: string;
  isLatest: boolean;
  lastModified?: string;
  size: number;
  etag?: string;
  storageClass?: string;
}

export interface S3ObjectMeta {
  key: string;
  contentType?: string;
  contentLength: number;
  lastModified?: string;
  etag?: string;
  metadata: Record<string, string>;
  versionId?: string;
  storageClass?: string;
}

export interface S3DeleteObjectsResult {
  deletedCount: number;
  errors: string[];
}

export interface S3ObjectTag {
  key: string;
  value: string;
}

export interface S3BucketStats {
  objectCount: number;
  totalSize: number;
  storageClassBreakdown: Record<string, number>;
}

export type S3ObjectRow =
  | {
      key: string;
      name: string;
      type: "folder";
      size: number;
      lastModified: string;
      storageClass: string;
    }
  | {
      key: string;
      name: string;
      type: "file";
      size: number;
      lastModified: string;
      storageClass: string;
      etag?: string;
    };
