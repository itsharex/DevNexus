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
import { PlusOutlined, CloudServerOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";

import { useS3ConnectionsStore } from "@/plugins/s3-client/store/s3-connections";
import { S3ConnectionForm } from "@/plugins/s3-client/components/S3ConnectionForm";
import type { S3ConnectionInfo, S3Provider } from "@/plugins/s3-client/types";

function providerTag(provider: S3Provider) {
  const map: Record<S3Provider, { text: string; color: string }> = {
    aws: { text: "AWS", color: "gold" },
    minio: { text: "MinIO", color: "red" },
    aliyun: { text: "Aliyun", color: "orange" },
    tencent: { text: "Tencent", color: "blue" },
    r2: { text: "R2", color: "cyan" },
    custom: { text: "Custom", color: "default" },
  };
  const item = map[provider];
  return <Tag color={item.color}>{item.text}</Tag>;
}

export function S3ConnectionList() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<S3ConnectionInfo | null>(null);

  const connections = useS3ConnectionsStore((state) => state.connections);
  const connectedIds = useS3ConnectionsStore((state) => state.connectedIds);
  const loading = useS3ConnectionsStore((state) => state.loading);
  const fetchConnections = useS3ConnectionsStore((state) => state.fetchConnections);
  const connect = useS3ConnectionsStore((state) => state.connect);
  const disconnect = useS3ConnectionsStore((state) => state.disconnect);
  const deleteConnection = useS3ConnectionsStore((state) => state.deleteConnection);
  const setActive = useS3ConnectionsStore((state) => state.setActive);
  const setWorkspaceTab = useS3ConnectionsStore((state) => state.setWorkspaceTab);
  const listBuckets = useS3ConnectionsStore((state) => state.listBuckets);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return connections;
    return connections.filter((item) => {
      const endpoint = item.endpoint ?? "";
      return (
        item.name.toLowerCase().includes(text) ||
        item.provider.toLowerCase().includes(text) ||
        endpoint.toLowerCase().includes(text)
      );
    });
  }, [connections, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, S3ConnectionInfo[]>();
    filtered.forEach((item) => {
      const key = item.groupName || "Default";
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return [...map.entries()];
  }, [filtered]);

  const openBuckets = async (item: S3ConnectionInfo) => {
    if (!connectedIds.includes(item.id)) {
      await connect(item.id);
    }
    setActive(item.id);
    await listBuckets(item.id);
    setWorkspaceTab("buckets");
    message.success(`Connected: ${item.name}`);
  };

  return (
    <Card
      title="S3 Connections"
      loading={loading}
      extra={
        <Space>
          <Input.Search
            placeholder="Search by name/provider"
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
        <Empty description="No S3 connections yet" />
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
                            label: "Connect & Open Buckets",
                            onClick: () => void openBuckets(item),
                          },
                          {
                            key: "disconnect",
                            label: "Disconnect",
                            disabled: !connected,
                            onClick: () =>
                              void disconnect(item.id).then(() =>
                                message.info(`Disconnected: ${item.name}`),
                              ),
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
                        onDoubleClick={() => void openBuckets(item)}
                      >
                        <Space style={{ width: "100%", justifyContent: "space-between" }}>
                          <div>
                            <Typography.Text strong>
                              <CloudServerOutlined style={{ marginRight: 6 }} />
                              {item.name}
                            </Typography.Text>
                            <div>
                              <Typography.Text type="secondary">
                                {item.endpoint || `region: ${item.region}`}
                              </Typography.Text>
                            </div>
                          </div>
                          <Space>
                            {providerTag(item.provider)}
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

      <S3ConnectionForm
        open={openForm}
        initialValues={editing}
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
