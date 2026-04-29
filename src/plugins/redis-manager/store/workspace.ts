import { create } from "zustand";

interface WorkspaceState {
  activeConnectionId: string | null;
  activeDbIndex: number;
  selectedKey: string | null;
  activeView: "connections" | "keys" | "console" | "server";
  setActiveConnectionId: (id: string | null) => void;
  setActiveDbIndex: (dbIndex: number) => void;
  setSelectedKey: (key: string | null) => void;
  setActiveView: (
    activeView: "connections" | "keys" | "console" | "server",
  ) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  activeConnectionId: null,
  activeDbIndex: 0,
  selectedKey: null,
  activeView: "connections",
  setActiveConnectionId: (activeConnectionId) => set({ activeConnectionId }),
  setActiveDbIndex: (activeDbIndex) => set({ activeDbIndex }),
  setSelectedKey: (selectedKey) => set({ selectedKey }),
  setActiveView: (activeView) => set({ activeView }),
}));
