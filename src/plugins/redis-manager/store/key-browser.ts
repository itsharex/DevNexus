import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

import type { HashField, KeyMeta, ScanResult, ZMember } from "@/plugins/redis-manager/types";

interface KeyBrowserState {
  pattern: string;
  cursor: number;
  keys: KeyMeta[];
  selectedKeys: string[];
  loading: boolean;
  selectedKey: string | null;
  selectedType: string | null;
  selectedTtl: number;
  stringValue: string;
  hashFields: HashField[];
  listValues: string[];
  setValues: string[];
  zsetValues: ZMember[];
  setPattern: (pattern: string) => void;
  toggleSelectedKey: (key: string, checked: boolean) => void;
  clearSelectedKeys: () => void;
  resetScan: () => void;
  scanMore: (connId: string) => Promise<void>;
  loadKeyDetail: (connId: string, key: string) => Promise<void>;
  updateString: (connId: string, value: string, ttl?: number) => Promise<void>;
  updateTTL: (connId: string, ttl: number) => Promise<void>;
  deleteKeys: (connId: string, keys: string[]) => Promise<number>;
  renameKey: (connId: string, oldKey: string, newKey: string) => Promise<void>;
  setHashField: (connId: string, key: string, field: string, value: string) => Promise<void>;
  deleteHashField: (connId: string, key: string, field: string) => Promise<void>;
  setListItem: (connId: string, key: string, index: number, value: string) => Promise<void>;
  lpush: (connId: string, key: string, value: string) => Promise<void>;
  rpush: (connId: string, key: string, value: string) => Promise<void>;
  lrem: (connId: string, key: string, value: string) => Promise<void>;
  sadd: (connId: string, key: string, member: string) => Promise<void>;
  srem: (connId: string, key: string, member: string) => Promise<void>;
  zadd: (connId: string, key: string, member: string, score: number) => Promise<void>;
  zrem: (connId: string, key: string, member: string) => Promise<void>;
  zrangeByScore: (connId: string, key: string, min: number, max: number) => Promise<void>;
}

export const useKeyBrowserStore = create<KeyBrowserState>()((set, get) => ({
  pattern: "*",
  cursor: 0,
  keys: [],
  selectedKeys: [],
  loading: false,
  selectedKey: null,
  selectedType: null,
  selectedTtl: -2,
  stringValue: "",
  hashFields: [],
  listValues: [],
  setValues: [],
  zsetValues: [],
  setPattern: (pattern) => set({ pattern }),
  toggleSelectedKey: (key, checked) =>
    set((state) => ({
      selectedKeys: checked
        ? [...new Set([...state.selectedKeys, key])]
        : state.selectedKeys.filter((item) => item !== key),
    })),
  clearSelectedKeys: () => set({ selectedKeys: [] }),
  resetScan: () => set({ cursor: 0, keys: [] }),
  scanMore: async (connId) => {
    set({ loading: true });
    try {
      const { pattern, cursor } = get();
      const result = await invoke<ScanResult>("cmd_scan_keys", {
        connId,
        pattern: pattern || "*",
        cursor,
        count: 200,
      });
      set((state) => ({
        cursor: result.nextCursor,
        keys: [...state.keys, ...result.keys],
      }));
    } finally {
      set({ loading: false });
    }
  },
  loadKeyDetail: async (connId, key) => {
    const keyType = await invoke<string>("cmd_get_key_type", { connId, key });
    const ttl = await invoke<number>("cmd_get_ttl", { connId, key });
    set({
      selectedKey: key,
      selectedType: keyType,
      selectedTtl: ttl,
      stringValue: "",
      hashFields: [],
      listValues: [],
      setValues: [],
      zsetValues: [],
    });

    if (keyType === "string") {
      const value = await invoke<string>("cmd_get_string", { connId, key });
      set({ stringValue: value });
      return;
    }
    if (keyType === "hash") {
      const value = await invoke<HashField[]>("cmd_hgetall", { connId, key });
      set({ hashFields: value });
      return;
    }
    if (keyType === "list") {
      const length = await invoke<number>("cmd_llen", { connId, key });
      const value = await invoke<string[]>("cmd_lrange", {
        connId,
        key,
        start: 0,
        stop: Math.max(length - 1, 0),
      });
      set({ listValues: value });
      return;
    }
    if (keyType === "set") {
      const value = await invoke<string[]>("cmd_smembers", { connId, key });
      set({ setValues: value });
      return;
    }
    if (keyType === "zset") {
      const length = await invoke<number>("cmd_zcard", { connId, key });
      const value = await invoke<ZMember[]>("cmd_zrange_withscores", {
        connId,
        key,
        start: 0,
        stop: Math.max(length - 1, 0),
      });
      set({ zsetValues: value });
    }
  },
  updateString: async (connId, value, ttl) => {
    const key = get().selectedKey;
    if (!key) {
      return;
    }
    await invoke("cmd_set_string", { connId, key, value, ttl });
    set({ stringValue: value });
  },
  updateTTL: async (connId, ttl) => {
    const key = get().selectedKey;
    if (!key) {
      return;
    }
    await invoke("cmd_set_ttl", { connId, key, ttlSeconds: ttl });
    set({ selectedTtl: ttl });
  },
  deleteKeys: async (connId, keys) => {
    const deleted = await invoke<number>("cmd_delete_keys", { connId, keys });
    set((state) => ({
      keys: state.keys.filter((item) => !keys.includes(item.key)),
      selectedKeys: state.selectedKeys.filter((item) => !keys.includes(item)),
      selectedKey:
        state.selectedKey && keys.includes(state.selectedKey)
          ? null
          : state.selectedKey,
    }));
    return deleted;
  },
  renameKey: async (connId, oldKey, newKey) => {
    await invoke("cmd_rename_key", { connId, oldKey, newKey });
    set((state) => ({
      keys: state.keys.map((item) =>
        item.key === oldKey ? { ...item, key: newKey } : item,
      ),
      selectedKey: state.selectedKey === oldKey ? newKey : state.selectedKey,
    }));
  },
  setHashField: async (connId, key, field, value) => {
    await invoke("cmd_hset", { connId, key, field, value });
    await get().loadKeyDetail(connId, key);
  },
  deleteHashField: async (connId, key, field) => {
    await invoke("cmd_hdel", { connId, key, field });
    await get().loadKeyDetail(connId, key);
  },
  setListItem: async (connId, key, index, value) => {
    await invoke("cmd_lset", { connId, key, index, value });
    await get().loadKeyDetail(connId, key);
  },
  lpush: async (connId, key, value) => {
    await invoke("cmd_lpush", { connId, key, value });
    await get().loadKeyDetail(connId, key);
  },
  rpush: async (connId, key, value) => {
    await invoke("cmd_rpush", { connId, key, value });
    await get().loadKeyDetail(connId, key);
  },
  lrem: async (connId, key, value) => {
    await invoke("cmd_lrem", { connId, key, count: 1, value });
    await get().loadKeyDetail(connId, key);
  },
  sadd: async (connId, key, member) => {
    await invoke("cmd_sadd", { connId, key, member });
    await get().loadKeyDetail(connId, key);
  },
  srem: async (connId, key, member) => {
    await invoke("cmd_srem", { connId, key, member });
    await get().loadKeyDetail(connId, key);
  },
  zadd: async (connId, key, member, score) => {
    await invoke("cmd_zadd", { connId, key, member, score });
    await get().loadKeyDetail(connId, key);
  },
  zrem: async (connId, key, member) => {
    await invoke("cmd_zrem", { connId, key, member });
    await get().loadKeyDetail(connId, key);
  },
  zrangeByScore: async (connId, key, min, max) => {
    const minScore = Number.isFinite(min) ? String(min) : "-inf";
    const maxScore = Number.isFinite(max) ? String(max) : "+inf";
    const values = await invoke<ZMember[]>("cmd_zrange_by_score", {
      connId,
      key,
      minScore,
      maxScore,
    });
    set({ zsetValues: values });
  },
}));
