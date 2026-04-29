import { App, Button, Card, Empty, Input, Modal, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { FolderOpenOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMemo, useState } from "react";

import { useS3ConnectionsStore } from "@/plugins/s3-client/store/s3-connections";

function formatBytes(size: number) {
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / Math.pow(1024, idx);
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

export function ObjectBrowser() {
  const { message } = App.useApp();
  const activeConnId = useS3ConnectionsStore((state) => state.activeConnId);
  const bucket = useS3ConnectionsStore((state) => state.selectedBucket);
  const prefix = useS3ConnectionsStore((state) => state.objectPrefix);
  const setPrefix = useS3ConnectionsStore((state) => state.setObjectPrefix);
  const objects = useS3ConnectionsStore((state) => state.objects);
  const commonPrefixes = useS3ConnectionsStore((state) => state.commonPrefixes);
  const nextToken = useS3ConnectionsStore((state) => state.nextToken);
  const loading = useS3ConnectionsStore((state) => state.objectLoading);
  const listObjects = useS3ConnectionsStore((state) => state.listObjects);
  const deleteObject = useS3ConnectionsStore((state) => state.deleteObject);
  const createFolder = useS3ConnectionsStore((state) => state.createFolder);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");

  const rows = useMemo(() => {
    const folderRows = commonPrefixes.map((item) => ({
      key: `folder:${item}`,
      name: item,
      type: "folder" as const,
      size: 0,
      lastModified: "",
      storageClass: "",
    }));
    const fileRows = objects.map((item) => ({
      key: `file:${item.key}`,
      name: item.key,
      type: "file" as const,
      size: item.size,
      lastModified: item.lastModified ?? "",
      storageClass: item.storageClass ?? "",
    }));
    return [...folderRows, ...fileRows];
  }, [commonPrefixes, objects]);

  if (!activeConnId || !bucket) {
    return (
      <Card title="Objects">
        <Empty description="Select a bucket first" />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <Typography.Text strong>Objects</Typography.Text>
          <Tag>{bucket}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Input
            placeholder="prefix (e.g. logs/2026/)"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            style={{ width: 280 }}
          />
          <Button icon={<PlusOutlined />} onClick={() => setCreateFolderOpen(true)}>
            New Folder
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() =>
              void listObjects({
                connId: activeConnId,
                bucket,
                prefix,
              })
            }
          >
            Refresh
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="key"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          {
            title: "Name",
            dataIndex: "name",
            render: (value: string, record) =>
              record.type === "folder" ? (
                <Button
                  type="link"
                  icon={<FolderOpenOutlined />}
                  onClick={() => {
                    setPrefix(value);
                    void listObjects({
                      connId: activeConnId,
                      bucket,
                      prefix: value,
                    });
                  }}
                >
                  {value}
                </Button>
              ) : (
                value
              ),
          },
          {
            title: "Type",
            dataIndex: "type",
            width: 100,
            render: (value: string) =>
              value === "folder" ? <Tag color="blue">Folder</Tag> : <Tag>File</Tag>,
          },
          {
            title: "Size",
            dataIndex: "size",
            width: 140,
            render: (value: number, record) => (record.type === "folder" ? "-" : formatBytes(value)),
          },
          {
            title: "Storage Class",
            dataIndex: "storageClass",
            width: 160,
            render: (value: string, record) => (record.type === "folder" ? "-" : value || "-"),
          },
          {
            title: "Last Modified",
            dataIndex: "lastModified",
            render: (value: string) => value || "-",
          },
          {
            title: "Actions",
            key: "actions",
            width: 120,
            render: (_, record) =>
              record.type === "file" ? (
                <Popconfirm
                  title={`Delete ${record.name}?`}
                  onConfirm={() =>
                    void deleteObject({
                      connId: activeConnId,
                      bucket,
                      key: record.name,
                      prefix,
                    }).then(() => message.success("Object deleted"))
                  }
                >
                  <Button danger type="link">
                    Delete
                  </Button>
                </Popconfirm>
              ) : (
                "-"
              ),
          },
        ]}
      />
      {nextToken ? (
        <div style={{ marginTop: 12 }}>
          <Button
            onClick={() =>
              void listObjects({
                connId: activeConnId,
                bucket,
                prefix,
                continuationToken: nextToken,
                append: true,
              })
            }
          >
            Load More
          </Button>
        </div>
      ) : null}
      <Modal
        title="Create Folder"
        open={createFolderOpen}
        onCancel={() => setCreateFolderOpen(false)}
        onOk={() => {
          const value = folderName.trim();
          if (!value) {
            message.error("folder name is required");
            return;
          }
          void createFolder({
            connId: activeConnId,
            bucket,
            prefix,
            folderName: value,
          }).then(() => {
            message.success("Folder created");
            setCreateFolderOpen(false);
            setFolderName("");
          });
        }}
      >
        <Input
          placeholder="folder-name"
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
        />
      </Modal>
    </Card>
  );
}
