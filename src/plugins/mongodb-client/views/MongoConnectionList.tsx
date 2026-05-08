import { App, Button, Card, Col, Input, Row, Space, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";

import { MongoConnectionForm } from "@/plugins/mongodb-client/components/MongoConnectionForm";
import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";
import type { MongoConnectionInfo } from "@/plugins/mongodb-client/types";

export function MongoConnectionList() {
  const { modal } = App.useApp();
  const connections = useMongoConnectionsStore((state) => state.connections);
  const connectedIds = useMongoConnectionsStore((state) => state.connectedIds);
  const fetchConnections = useMongoConnectionsStore((state) => state.fetchConnections);
  const connect = useMongoConnectionsStore((state) => state.connect);
  const disconnect = useMongoConnectionsStore((state) => state.disconnect);
  const deleteConnection = useMongoConnectionsStore((state) => state.deleteConnection);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MongoConnectionInfo | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const filtered = useMemo(
    () =>
      connections.filter((item) =>
        `${item.name} ${item.groupName ?? ""} ${item.host ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [connections, search],
  );

  const groups = useMemo(() => {
    const map = new Map<string, MongoConnectionInfo[]>();
    for (const conn of filtered) {
      const key = conn.groupName || "Default";
      map.set(key, [...(map.get(key) ?? []), conn]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <Card
      title="MongoDB Connections"
      extra={
        <Space>
          <Input.Search placeholder="Search by name" allowClear onChange={(event) => setSearch(event.target.value)} />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New
          </Button>
        </Space>
      }
      style={{ height: "100%", overflow: "auto" }}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        {groups.map(([group, items]) => (
          <div key={group}>
            <Typography.Text strong>{group}</Typography.Text>
            <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
              {items.map((conn) => {
                const connected = connectedIds.includes(conn.id);
                return (
                  <Col key={conn.id} xs={24} md={12} xl={8}>
                    <Card
                      hoverable
                      size="small"
                      onDoubleClick={() => void connect(conn.id)}
                      actions={[
                        <Button
                          key="connect"
                          type="link"
                          onClick={() => (connected ? void disconnect(conn.id) : void connect(conn.id))}
                        >
                          {connected ? "Disconnect" : "Connect"}
                        </Button>,
                        <EditOutlined
                          key="edit"
                          onClick={() => {
                            setEditing(conn);
                            setFormOpen(true);
                          }}
                        />,
                        <DeleteOutlined
                          key="delete"
                          onClick={() =>
                            modal.confirm({
                              title: "Delete MongoDB connection?",
                              content: conn.name,
                              okButtonProps: { danger: true },
                              onOk: () => deleteConnection(conn.id),
                            })
                          }
                        />,
                      ]}
                    >
                      <Space direction="vertical" size={4}>
                        <Space>
                          <Typography.Text strong>{conn.name}</Typography.Text>
                          <Tag className="rdmm-mongo-connection-tag" color={connected ? "green" : "default"}>
                            {connected ? "Connected" : "Disconnected"}
                          </Tag>
                        </Space>
                        <Typography.Text type="secondary">
                          {conn.mode === "uri" ? "MongoDB URI" : `${conn.host}:${conn.port}`}
                        </Typography.Text>
                        <Space wrap>
                          {conn.defaultDatabase ? (
                            <Tag className="rdmm-mongo-connection-tag">{conn.defaultDatabase}</Tag>
                          ) : null}
                          {conn.tls ? (
                            <Tag className="rdmm-mongo-connection-tag" color="blue">
                              TLS
                            </Tag>
                          ) : null}
                          {conn.srv ? (
                            <Tag className="rdmm-mongo-connection-tag" color="purple">
                              SRV
                            </Tag>
                          ) : null}
                        </Space>
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </div>
        ))}
      </Space>
      <MongoConnectionForm open={formOpen} initial={editing} onClose={() => setFormOpen(false)} />
    </Card>
  );
}
