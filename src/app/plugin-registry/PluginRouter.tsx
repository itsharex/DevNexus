import { Alert } from "antd";
import { useMemo } from "react";

import { getAll, getById } from "@/app/plugin-registry/registry";
import { useSettingsStore } from "@/app/store/settings";

export function PluginRouter() {
  const selectedPluginId = useSettingsStore((state) => state.selectedPluginId);

  const selectedPlugin = useMemo(
    () => getById(selectedPluginId) ?? getAll()[0],
    [selectedPluginId],
  );

  if (!selectedPlugin) {
    return (
      <Alert
        type="warning"
        showIcon
        message="No plugin registered"
        description="Please register at least one plugin in the registry."
      />
    );
  }

  const Component = selectedPlugin.component;
  return <Component />;
}
