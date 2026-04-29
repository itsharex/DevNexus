import {
  App,
  Button,
  Card,
  Dropdown,
  Empty,
  Input,
  Space,
  Tag,
  Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";

import { useSshConnectionsStore } from "@/plugins/ssh-client/store/ssh-connections";
import { useSshWorkspaceStore } from "@/plugins/ssh-client/store/workspace";
import { useSshSessionsStore } from "@/plugins/ssh-client/store/sessions";
import { SshConnectionForm } from "@/plugins/ssh-client/components/SshConnectionForm";
import type { SshConnectionInfo } from "@/plugins/ssh-client/types";

function authTypeTag(authType: string) {
  if (authType === "password") return <Tag color="default">Password</Tag>;
  if (authType === "key") return <Tag color="blue">Key</Tag>;
  return <Tag color="purple">Key+Passphrase</Tag>;
}

export function SshConnectionList() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<SshConnectionInfo | null>(null);

  const connections = useSshConnectionsStore((state) => state.connections);
  const connectedIds = useSshConnectionsStore((state) => state.connectedIds);
  const loading = useSshConnectionsStore((state) => state.loading);
  const fetchConnections = useSshConnectionsStore((state) => state.fetchConnections);
  const connect = useSshConnectionsStore((state) => state.connect);
  const disconnect = useSshConnectionsStore((state) => state.disconnect);
  const deleteConnection = useSshConnectionsStore((state) => state.deleteConnection);

  const setActiveView = useSshWorkspaceStore((state) => state.setActiveView);
  const setActiveConnectionId = useSshWorkspaceStore((state) => state.setActiveConnectionId);
  const openSession = useSshSessionsStore((state) => state.openSession);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return connections;
    return connections.filter(
      (item) =>
        item.name.toLowerCase().includes(text) ||
        item.host.toLowerCase().includes(text),
    );
  }, [connections, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, SshConnectionInfo[]>();
    filtered.forEach((item) => {
      const key = item.groupName || "Default";
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return [...map.entries()];
  }, [filtered]);

  const openTerminal = async (item: SshConnectionInfo, newTab: boolean) => {
    if (!connectedIds.includes(item.id)) {
      await connect(item.id);
    }
    setActiveConnectionId(item.id);
    setActiveView("terminal");
    await openSession(item.id, newTab ? `${item.name} #new` : item.name);
    message.success(`SSH connected: ${item.username}@${item.host}:${item.port}`);
  };

  return (
    <Card
      title="SSH Connections"
      loading={loading}
      extra={
        <Space>
          <Input.Search
            placeholder="Search by name/host"
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 260 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setOpenForm(true);
            }}
          >
            New
          </Button>
        </Space>
      }
    >
      {grouped.length === 0 ? (
        <Empty description="No SSH connections yet" />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
            gap: 12,
            alignItems: "start",
          }}
        >
          {grouped.map(([groupName, items]) => (
            <Card key={groupName} size="small" title={groupName}>
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                {items.map((item) => {
                  const connected = connectedIds.includes(item.id);
                  return (
                    <Dropdown
                      key={item.id}
                      trigger={["contextMenu"]}
                      menu={{
                        items: [
                          {
                            key: "open",
                            label: "Connect & Open",
                            onClick: () => void openTerminal(item, false),
                          },
                          {
                            key: "new-tab",
                            label: "Open in New Tab",
                            onClick: () => void openTerminal(item, true),
                          },
                          {
                            key: "disconnect",
                            label: "Disconnect",
                            onClick: () =>
                              void disconnect(item.id).then(() =>
                                message.info(`Disconnected: ${item.name}`),
                              ),
                            disabled: !connected,
                          },
                          {
                            key: "edit",
                            label: "Edit",
                            onClick: () => {
                              setEditing(item);
                              setOpenForm(true);
                            },
                          },
                          {
                            key: "delete",
                            label: "Delete",
                            danger: true,
                            onClick: () =>
                              void deleteConnection(item.id).then(() =>
                                message.success(`Deleted: ${item.name}`),
                              ),
                          },
                        ],
                      }}
                    >
                      <Card
                        size="small"
                        hoverable
                        onDoubleClick={() => void openTerminal(item, false)}
                      >
                        <Space style={{ width: "100%", justifyContent: "space-between" }}>
                          <div>
                            <Typography.Text strong>{item.name}</Typography.Text>
                            <div>
                              <Typography.Text type="secondary">
                                {item.username}@{item.host}:{item.port}
                              </Typography.Text>
                            </div>
                          </div>
                          <Space>
                            {authTypeTag(item.authType)}
                            <Tag color={connected ? "green" : "default"}>
                              {connected ? "Connected" : "Disconnected"}
                            </Tag>
                          </Space>
                        </Space>
                      </Card>
                    </Dropdown>
                  );
                })}
              </Space>
            </Card>
          ))}
        </div>
      )}

      <SshConnectionForm
        open={openForm}
        initialValues={editing}
        allConnections={connections}
        onCancel={() => {
          setOpenForm(false);
          setEditing(null);
        }}
        onSaved={() => {
          setOpenForm(false);
          setEditing(null);
          void fetchConnections();
        }}
      />
    </Card>
  );
}
