import {
  AppstoreOutlined,
  LeftOutlined,
  MoonOutlined,
  RightOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import clsx from "clsx";

import { getAll } from "@/app/plugin-registry/registry";
import { useSettingsStore } from "@/app/store/settings";
import { useThemeStore } from "@/app/store/theme";

export function Sidebar() {
  const plugins = getAll();
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore(
    (state) => state.setSidebarCollapsed,
  );
  const selectedPluginId = useSettingsStore((state) => state.selectedPluginId);
  const setSelectedPluginId = useSettingsStore(
    (state) => state.setSelectedPluginId,
  );
  const mode = useThemeStore((state) => state.mode);
  const toggleMode = useThemeStore((state) => state.toggleMode);

  return (
    <aside
      className={clsx("rdmm-sidebar", {
        "rdmm-sidebar--collapsed": sidebarCollapsed,
      })}
    >
      <div className="rdmm-sidebar__top">
        <div className="rdmm-sidebar__brand">
          <AppstoreOutlined />
          {sidebarCollapsed ? null : <span>RDMM</span>}
        </div>
        <Button
          type="text"
          className="rdmm-sidebar__toggle"
          icon={sidebarCollapsed ? <RightOutlined /> : <LeftOutlined />}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>
      <nav className="rdmm-sidebar__plugins">
        {plugins.map((plugin) => {
          const selected = selectedPluginId === plugin.id;
          const label = sidebarCollapsed ? (
            <Tooltip placement="right" title={plugin.name}>
              <Button
                className={clsx("rdmm-sidebar__plugin-button", {
                  "rdmm-sidebar__plugin-button--active": selected,
                })}
                type="text"
                icon={plugin.icon}
                onClick={() => setSelectedPluginId(plugin.id)}
              />
            </Tooltip>
          ) : (
            <Button
              className={clsx("rdmm-sidebar__plugin-button", {
                "rdmm-sidebar__plugin-button--active": selected,
              })}
              type="text"
              icon={plugin.icon}
              onClick={() => setSelectedPluginId(plugin.id)}
            >
              <span className="rdmm-sidebar__plugin-label">{plugin.name}</span>
            </Button>
          );

          return <div key={plugin.id}>{label}</div>;
        })}
      </nav>
      <div className="rdmm-sidebar__bottom">
        <Button
          type="text"
          icon={mode === "light" ? <MoonOutlined /> : <SunOutlined />}
          onClick={toggleMode}
        >
          {sidebarCollapsed ? null : mode === "light" ? "Dark" : "Light"}
        </Button>
      </div>
    </aside>
  );
}
