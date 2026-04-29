import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

import type { SshGeneratedKeyPair, SshKeyInfo } from "@/plugins/ssh-client/types";

interface KeysState {
  keys: SshKeyInfo[];
  loading: boolean;
  generated?: SshGeneratedKeyPair;
  fetchKeys: () => Promise<void>;
  importKey: (name: string, privateKeyPath: string, passphrase?: string) => Promise<void>;
  deleteKey: (id: string) => Promise<void>;
  generateKey: (name: string, keyType: "ed25519" | "rsa") => Promise<void>;
  getPublicKey: (id: string) => Promise<string>;
}

export const useSshKeysStore = create<KeysState>()((set, get) => ({
  keys: [],
  loading: false,
  generated: undefined,
  fetchKeys: async () => {
    set({ loading: true });
    try {
      const keys = await invoke<SshKeyInfo[]>("cmd_ssh_list_keys");
      set({ keys });
    } finally {
      set({ loading: false });
    }
  },
  importKey: async (name, privateKeyPath, passphrase) => {
    await invoke("cmd_ssh_import_key", { name, privateKeyPath, passphrase });
    await get().fetchKeys();
  },
  deleteKey: async (id) => {
    await invoke("cmd_ssh_delete_key", { id });
    set((state) => ({ keys: state.keys.filter((item) => item.id !== id) }));
  },
  generateKey: async (name, keyType) => {
    const generated = await invoke<SshGeneratedKeyPair>("cmd_ssh_generate_key", {
      name,
      keyType,
    });
    set({ generated });
  },
  getPublicKey: (id) => invoke<string>("cmd_ssh_get_public_key", { id }),
}));
