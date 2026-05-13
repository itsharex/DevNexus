import { App, Button, Card, Empty, Input, Modal, Space, Tabs } from "antd";
import { useState } from "react";

import { useSshConnectionsStore } from "@/plugins/ssh-client/store/ssh-connections";
import { useSshSessionsStore } from "@/plugins/ssh-client/store/sessions";
import { TerminalTab } from "@/plugins/ssh-client/components/TerminalTab";

export function TerminalWorkspace() {
  const { message } = App.useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const sessions = useSshSessionsStore((state) => state.sessions);
  const activeSessionId = useSshSessionsStore((state) => state.activeSessionId);
  const setActive = useSshSessionsStore((state) => state.setActive);
  const openSession = useSshSessionsStore((state) => state.openSession);
  const closeSession = useSshSessionsStore((state) => state.closeSession);
  const renameSession = useSshSessionsStore((state) => state.renameSession);

  const connections = useSshConnectionsStore((state) => state.connections);
  const connect = useSshConnectionsStore((state) => state.connect);
  const connectedIds = useSshConnectionsStore((state) => state.connectedIds);

  const openNewTab = async (connId: string, label: string) => {
    if (!connectedIds.includes(connId)) {
      await connect(connId);
    }
    await openSession(connId, label);
    setPickerOpen(false);
  };

  if (sessions.length === 0) {
    return (
      <Card
        title="Terminal Workspace"
        style={{ height: "100%" }}
        styles={{ body: { minHeight: 0 } }}
        extra={
          <Button type="primary" onClick={() => setPickerOpen(true)}>
            + New Tab
          </Button>
        }
      >
        <Empty description="No active terminal tabs" />
        <Modal
          title="Open SSH Session"
          open={pickerOpen}
          onCancel={() => setPickerOpen(false)}
          footer={null}
        >
          <Space direction="vertical" style={{ width: "100%" }}>
            {connections.map((item) => (
              <Button
                key={item.id}
                block
                onClick={() => void openNewTab(item.id, item.name)}
              >
                {item.name} ({item.username}@{item.host}:{item.port})
              </Button>
            ))}
          </Space>
        </Modal>
      </Card>
    );
  }

  return (
    <Card
      title="Terminal Workspace"
      extra={
        <Button type="primary" onClick={() => setPickerOpen(true)}>
          + New Tab
        </Button>
      }
      style={{ height: "100%" }}
      styles={{
        body: {
          padding: 10,
          height: "calc(100% - 56px)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        },
      }}
    >
      <Tabs
        className="devnexus-terminal-tabs"
        type="editable-card"
        hideAdd
        style={{ height: "100%", minHeight: 0 }}
        tabBarStyle={{ marginBottom: 8 }}
        activeKey={activeSessionId ?? sessions[0].sessionId}
        onChange={(key) => setActive(key)}
        onEdit={(targetKey, action) => {
          if (action === "remove" && typeof targetKey === "string") {
            void closeSession(targetKey);
          }
        }}
        items={sessions.map((session) => ({
          key: session.sessionId,
          label: (
            <span
              onContextMenu={(event) => {
                event.preventDefault();
                setRenameSessionId(session.sessionId);
                setRenameText(session.tabLabel);
              }}
            >
              {session.tabLabel}
            </span>
          ),
          children: (
            <div style={{ height: "100%", minHeight: 0 }}>
              <TerminalTab
                sessionId={session.sessionId}
                connId={session.connId}
                status={session.status}
              />
            </div>
          ),
        }))}
      />

      <Modal
        title="Rename Tab"
        open={!!renameSessionId}
        onCancel={() => setRenameSessionId(null)}
        onOk={() => {
          if (!renameSessionId) {
            return;
          }
          renameSession(renameSessionId, renameText.trim() || "Terminal");
          setRenameSessionId(null);
          message.success("Tab renamed.");
        }}
      >
        <Input value={renameText} onChange={(event) => setRenameText(event.target.value)} />
      </Modal>

      <Modal
        title="Open SSH Session"
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          {connections.map((item) => (
            <Button
              key={item.id}
              block
              onClick={() => void openNewTab(item.id, item.name)}
            >
              {item.name} ({item.username}@{item.host}:{item.port})
            </Button>
          ))}
        </Space>
      </Modal>
    </Card>
  );
}
