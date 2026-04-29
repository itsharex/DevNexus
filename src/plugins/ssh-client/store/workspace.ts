import { create } from "zustand";

export type SshWorkspaceTab =
  | "connections"
  | "terminal"
  | "keys"
  | "tunnels";

interface SshWorkspaceState {
  activeView: SshWorkspaceTab;
  activeConnectionId: string | null;
  setActiveView: (view: SshWorkspaceTab) => void;
  setActiveConnectionId: (id: string | null) => void;
}

export const useSshWorkspaceStore = create<SshWorkspaceState>()((set) => ({
  activeView: "connections",
  activeConnectionId: null,
  setActiveView: (activeView) => set({ activeView }),
  setActiveConnectionId: (activeConnectionId) => set({ activeConnectionId }),
}));
