import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  selectedPluginId: string;
  setSelectedPluginId: (id: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      selectedPluginId: "redis-manager",
      setSelectedPluginId: (selectedPluginId) => set({ selectedPluginId }),
    }),
    {
      name: "rdmm-settings",
    },
  ),
);
