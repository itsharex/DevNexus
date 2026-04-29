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
