import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

import type {
  S3BucketInfo,
  S3ConnectionFormData,
  S3ConnectionInfo,
  S3Latency,
  S3ListObjectsResult,
} from "@/plugins/s3-client/types";

interface S3ConnectionsState {
  workspaceTab: "connections" | "buckets" | "objects";
  connections: S3ConnectionInfo[];
  connectedIds: string[];
  activeConnId: string | null;
  loading: boolean;
  buckets: S3BucketInfo[];
  bucketLoading: boolean;
  selectedBucket: string | null;
  objectPrefix: string;
  objectLoading: boolean;
  objects: S3ListObjectsResult["objects"];
  commonPrefixes: string[];
  nextToken: string | null;
  fetchConnections: () => Promise<void>;
  saveConnection: (form: S3ConnectionFormData) => Promise<string>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (form: S3ConnectionFormData) => Promise<S3Latency>;
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  listBuckets: (connId: string) => Promise<void>;
  createBucket: (connId: string, name: string, region?: string) => Promise<void>;
  deleteBucket: (connId: string, name: string) => Promise<void>;
  selectBucket: (bucket: string | null) => void;
  setObjectPrefix: (prefix: string) => void;
  listObjects: (args: {
    connId: string;
    bucket: string;
    prefix?: string;
    continuationToken?: string;
    append?: boolean;
  }) => Promise<void>;
  deleteObject: (args: {
    connId: string;
    bucket: string;
    key: string;
    prefix?: string;
  }) => Promise<void>;
  createFolder: (args: {
    connId: string;
    bucket: string;
    prefix: string;
    folderName: string;
  }) => Promise<void>;
  setWorkspaceTab: (tab: "connections" | "buckets" | "objects") => void;
  setActive: (id: string | null) => void;
}

export const useS3ConnectionsStore = create<S3ConnectionsState>()((set) => ({
  workspaceTab: "connections",
  connections: [],
  connectedIds: [],
  activeConnId: null,
  loading: false,
  buckets: [],
  bucketLoading: false,
  selectedBucket: null,
  objectPrefix: "",
  objectLoading: false,
  objects: [],
  commonPrefixes: [],
  nextToken: null,
  fetchConnections: async () => {
    set({ loading: true });
    try {
      const connections = await invoke<S3ConnectionInfo[]>("cmd_s3_list_connections");
      set({ connections });
    } finally {
      set({ loading: false });
    }
  },
  saveConnection: async (form) => {
    const id = await invoke<string>("cmd_s3_save_connection", { form });
    const connections = await invoke<S3ConnectionInfo[]>("cmd_s3_list_connections");
    set({ connections });
    return id;
  },
  deleteConnection: async (id) => {
    await invoke("cmd_s3_delete_connection", { id });
    set((state) => ({
      connections: state.connections.filter((item) => item.id !== id),
      connectedIds: state.connectedIds.filter((item) => item !== id),
      activeConnId: state.activeConnId === id ? null : state.activeConnId,
    }));
  },
  testConnection: async (form) =>
    invoke<S3Latency>("cmd_s3_test_connection", {
      form,
    }),
  connect: async (id) => {
    await invoke("cmd_s3_connect", { id });
    set((state) => ({
      connectedIds: [...new Set([...state.connectedIds, id])],
      activeConnId: id,
    }));
  },
  disconnect: async (id) => {
    await invoke("cmd_s3_disconnect", { id });
      set((state) => ({
      connectedIds: state.connectedIds.filter((item) => item !== id),
      activeConnId: state.activeConnId === id ? null : state.activeConnId,
      buckets: state.activeConnId === id ? [] : state.buckets,
      selectedBucket: state.activeConnId === id ? null : state.selectedBucket,
      objects: state.activeConnId === id ? [] : state.objects,
      commonPrefixes: state.activeConnId === id ? [] : state.commonPrefixes,
      nextToken: state.activeConnId === id ? null : state.nextToken,
    }));
  },
  listBuckets: async (connId) => {
    set({ bucketLoading: true });
    try {
      const buckets = await invoke<S3BucketInfo[]>("cmd_s3_list_buckets", { connId });
      set({ buckets });
    } finally {
      set({ bucketLoading: false });
    }
  },
  createBucket: async (connId, name, region) => {
    await invoke("cmd_s3_create_bucket", { connId, name, region });
    const buckets = await invoke<S3BucketInfo[]>("cmd_s3_list_buckets", { connId });
    set({ buckets });
  },
  deleteBucket: async (connId, name) => {
    await invoke("cmd_s3_delete_bucket", { connId, name });
    const buckets = await invoke<S3BucketInfo[]>("cmd_s3_list_buckets", { connId });
    set({ buckets });
  },
  selectBucket: (selectedBucket) =>
    set({
      selectedBucket,
      objectPrefix: "",
      objects: [],
      commonPrefixes: [],
      nextToken: null,
    }),
  setObjectPrefix: (objectPrefix) => set({ objectPrefix }),
  listObjects: async ({ connId, bucket, prefix, continuationToken, append }) => {
    set({ objectLoading: true });
    try {
      const result = await invoke<S3ListObjectsResult>("cmd_s3_list_objects", {
        connId,
        bucket,
        prefix: prefix ?? "",
        continuationToken: continuationToken ?? null,
        maxKeys: 200,
      });
      set((state) => ({
        objects: append ? [...state.objects, ...result.objects] : result.objects,
        commonPrefixes: append
          ? [...new Set([...state.commonPrefixes, ...result.commonPrefixes])]
          : result.commonPrefixes,
        nextToken: result.nextToken ?? null,
      }));
    } finally {
      set({ objectLoading: false });
    }
  },
  deleteObject: async ({ connId, bucket, key, prefix }) => {
    await invoke("cmd_s3_delete_object", { connId, bucket, key, versionId: null });
    const result = await invoke<S3ListObjectsResult>("cmd_s3_list_objects", {
      connId,
      bucket,
      prefix: prefix ?? "",
      continuationToken: null,
      maxKeys: 200,
    });
    set({
      objects: result.objects,
      commonPrefixes: result.commonPrefixes,
      nextToken: result.nextToken ?? null,
    });
  },
  createFolder: async ({ connId, bucket, prefix, folderName }) => {
    const name = folderName.trim();
    if (!name) {
      return;
    }
    const normalizedPrefix = prefix.trim();
    const fullPrefix = normalizedPrefix ? `${normalizedPrefix}${name}/` : `${name}/`;
    await invoke("cmd_s3_create_folder", { connId, bucket, prefix: fullPrefix });
    const result = await invoke<S3ListObjectsResult>("cmd_s3_list_objects", {
      connId,
      bucket,
      prefix: prefix ?? "",
      continuationToken: null,
      maxKeys: 200,
    });
    set({
      objects: result.objects,
      commonPrefixes: result.commonPrefixes,
      nextToken: result.nextToken ?? null,
    });
  },
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
  setActive: (activeConnId) => set({ activeConnId }),
}));
