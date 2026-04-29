import { Layout, Tag, Typography } from "antd";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CSSProperties } from "react";

import { Sidebar } from "@/app/layout/Sidebar";
import { Titlebar } from "@/app/layout/Titlebar";
import { PluginRouter } from "@/app/plugin-registry/PluginRouter";
import { useSettingsStore } from "@/app/store/settings";

const { Content, Footer } = Layout;
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

export function AppShell() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const appWindow = isTauri() ? getCurrentWindow() : null;
  const edgeSize = 6;

  const edgeOverlays: Array<{
    key: string;
    direction: ResizeDirection;
    style: CSSProperties;
  }> = [
    {
      key: "top",
      direction: "North",
      style: { top: 0, left: edgeSize, right: edgeSize, height: edgeSize, cursor: "ns-resize" },
    },
    {
      key: "right",
      direction: "East",
      style: { top: edgeSize, right: 0, bottom: edgeSize, width: edgeSize, cursor: "ew-resize" },
    },
    {
      key: "bottom",
      direction: "South",
      style: { left: edgeSize, right: edgeSize, bottom: 0, height: edgeSize, cursor: "ns-resize" },
    },
    {
      key: "left",
      direction: "West",
      style: { top: edgeSize, left: 0, bottom: edgeSize, width: edgeSize, cursor: "ew-resize" },
    },
    {
      key: "nw",
      direction: "NorthWest",
      style: { top: 0, left: 0, width: edgeSize * 2, height: edgeSize * 2, cursor: "nwse-resize" },
    },
    {
      key: "ne",
      direction: "NorthEast",
      style: { top: 0, right: 0, width: edgeSize * 2, height: edgeSize * 2, cursor: "nesw-resize" },
    },
    {
      key: "se",
      direction: "SouthEast",
      style: {
        right: 0,
        bottom: 0,
        width: edgeSize * 2,
        height: edgeSize * 2,
        cursor: "nwse-resize",
      },
    },
    {
      key: "sw",
      direction: "SouthWest",
      style: { left: 0, bottom: 0, width: edgeSize * 2, height: edgeSize * 2, cursor: "nesw-resize" },
    },
  ];

  return (
    <Layout className="rdmm-layout">
      {appWindow &&
        edgeOverlays.map((item) => (
          <div
            key={item.key}
            style={{
              position: "fixed",
              zIndex: 9999,
              ...item.style,
            }}
            onMouseDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              void appWindow.startResizeDragging(item.direction);
            }}
          />
        ))}
      <Titlebar />
      <Layout hasSider className="rdmm-layout__main">
        <Sidebar />
        <Layout>
          <Content className="rdmm-layout__content">
            <div className="rdmm-layout__content-card">
              <PluginRouter />
            </div>
          </Content>
          <Footer className="rdmm-layout__footer">
            <Typography.Text type="secondary">
              Sidebar:
              <Tag color="blue">{sidebarCollapsed ? "64px" : "200px"}</Tag>
            </Typography.Text>
            <Typography.Text type="secondary">
              Connection:
              <Tag>Disconnected</Tag>
            </Typography.Text>
            <Typography.Text type="secondary">
              Redis:
              <Tag>Unknown</Tag>
            </Typography.Text>
            <Typography.Text type="secondary">
              Latency:
              <Tag>-- ms</Tag>
            </Typography.Text>
          </Footer>
        </Layout>
      </Layout>
    </Layout>
  );
}
