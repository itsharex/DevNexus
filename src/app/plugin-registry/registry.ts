import type { PluginManifest } from "./types";

const pluginRegistry = new Map<string, PluginManifest>();

export function register(plugin: PluginManifest): void {
  if (pluginRegistry.has(plugin.id)) {
    return;
  }

  pluginRegistry.set(plugin.id, plugin);
}

export function getAll(): PluginManifest[] {
  return [...pluginRegistry.values()].sort(
    (left, right) => left.sidebarOrder - right.sidebarOrder,
  );
}

export function getById(id: string): PluginManifest | undefined {
  return pluginRegistry.get(id);
}

export function clearRegistry(): void {
  pluginRegistry.clear();
}
