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
import { useEffect, useMemo, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";

import { ConnectionForm } from "@/plugins/redis-manager/components/ConnectionForm";
import { useConnectionsStore } from "@/plugins/redis-manager/store/connections";
import { useWorkspaceStore } from "@/plugins/redis-manager/store/workspace";
import type { ConnectionInfo } from "@/plugins/redis-manager/types";

export function ConnectionList() {
  const { message } = App.useApp();
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<ConnectionInfo | null>(null);
  const [keyword, setKeyword] = useState("");

  const loading = useConnectionsStore((state) => state.loading);
  const connections = useConnectionsStore((state) => state.connections);
  const connectedIds = useConnectionsStore((state) => state.connectedIds);
  const fetchConnections = useConnectionsStore((state) => state.fetchConnections);
  const connect = useConnectionsStore((state) => state.connect);
  const disconnect = useConnectionsStore((state) => state.disconnect);
  const removeConnection = useConnectionsStore((state) => state.removeConnection);
  const setActiveConnectionId = useWorkspaceStore(
    (state) => state.setActiveConnectionId,
  );
  const setActiveDbIndex = useWorkspaceStore((state) => state.setActiveDbIndex);
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) {
      return connections;
    }
    return connections.filter((item) => item.name.toLowerCase().includes(text));
  }, [connections, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, ConnectionInfo[]>();
    filtered.forEach((item) => {
      const key = item.groupName || "Default";
      const prev = map.get(key) ?? [];
      map.set(key, [...prev, item]);
    });
    return [...map.entries()];
  }, [filtered]);

  const onConnect = async (item: ConnectionInfo) => {
    await connect(item.id);
    setActiveConnectionId(item.id);
    setActiveDbIndex(item.dbIndex);
    setActiveView("keys");
    message.success(`Connected: ${item.name}`);
  };

  const onDisconnect = async (item: ConnectionInfo) => {
    await disconnect(item.id);
    message.info(`Disconnected: ${item.name}`);
  };

  const onDelete = async (item: ConnectionInfo) => {
    await removeConnection(item.id);
    message.success(`Deleted: ${item.name}`);
  };

  const onSaved = async () => {
    setOpenForm(false);
    setEditing(null);
    await fetchConnections();
  };

  return (
    <Card
      title="Connections"
      loading={loading}
      extra={
        <Space>
          <Input.Search
            placeholder="Search by name"
            allowClear
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 220 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOpenForm(true)}
          >
            New
          </Button>
        </Space>
      }
    >
      {grouped.length === 0 ? (
        <Empty description="No connections yet" />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 12,
            alignItems: "start",
          }}
        >
          {grouped.map(([groupName, items]) => (
            <Card
              key={groupName}
              size="small"
              title={<Typography.Text strong>{groupName}</Typography.Text>}
              style={{ height: "100%" }}
            >
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
                            key: "connect",
                            label: connected ? "Disconnect" : "Connect",
                            onClick: () =>
                              connected ? onDisconnect(item) : onConnect(item),
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
                            onClick: () => onDelete(item),
                          },
                        ],
                      }}
                    >
                      <Card
                        size="small"
                        hoverable
                        onDoubleClick={() => {
                          void onConnect(item);
                        }}
                      >
                        <Space
                          style={{ width: "100%", justifyContent: "space-between" }}
                        >
                          <div>
                            <Typography.Text strong>{item.name}</Typography.Text>
                            <div>
                              <Typography.Text type="secondary">
                                {item.host}:{item.port}
                              </Typography.Text>
                            </div>
                          </div>
                          <Tag color={connected ? "green" : "default"}>
                            {connected ? "Connected" : "Disconnected"}
                          </Tag>
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
      <ConnectionForm
        open={openForm}
        initialValues={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                groupName: editing.groupName,
                host: editing.host,
                port: editing.port,
                dbIndex: editing.dbIndex,
                connectionType:
                  editing.connectionType as "Standalone" | "Sentinel" | "Cluster",
              }
            : null
        }
        onCancel={() => {
          setOpenForm(false);
          setEditing(null);
        }}
        onSaved={() => void onSaved()}
      />
    </Card>
  );
}
