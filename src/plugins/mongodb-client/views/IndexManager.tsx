import { App, Button, Card, Empty, Input, Modal, Space, Table, Tag } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";

import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";

export function IndexManager() {
  const { message, modal } = App.useApp();
  const activeConnId = useMongoConnectionsStore((state) => state.activeConnId);
  const activeDatabase = useMongoConnectionsStore((state) => state.activeDatabase);
  const activeCollection = useMongoConnectionsStore((state) => state.activeCollection);
  const indexes = useMongoConnectionsStore((state) => state.indexes);
  const listIndexes = useMongoConnectionsStore((state) => state.listIndexes);
  const createIndex = useMongoConnectionsStore((state) => state.createIndex);
  const dropIndex = useMongoConnectionsStore((state) => state.dropIndex);
  const [open, setOpen] = useState(false);
  const [keysJson, setKeysJson] = useState("{\n  \"field\": 1\n}");
  const [optionsJson, setOptionsJson] = useState("{\n  \"name\": \"field_1\"\n}");

  useEffect(() => {
    if (activeConnId && activeDatabase && activeCollection) void listIndexes();
  }, [activeCollection, activeConnId, activeDatabase, listIndexes]);

  if (!activeConnId || !activeDatabase || !activeCollection) {
    return <Empty description="Select a collection first." />;
  }

  return (
    <Card
      title={`Indexes / ${activeDatabase}.${activeCollection}`}
      style={{ height: "100%", overflow: "auto", minWidth: 920 }}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void listIndexes()} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New Index
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="name"
        dataSource={indexes}
        columns={[
          { title: "Name", dataIndex: "name" },
          {
            title: "Keys",
            dataIndex: "keysJson",
            render: (value: string) => <pre style={{ margin: 0 }}>{value}</pre>,
          },
          {
            title: "Options",
            render: (_, row) => (
              <Space>
                {row.unique ? <Tag color="red">unique</Tag> : null}
                {row.sparse ? <Tag color="blue">sparse</Tag> : null}
                {row.expireAfterSeconds ? <Tag>TTL {row.expireAfterSeconds}s</Tag> : null}
              </Space>
            ),
          },
          {
            title: "Action",
            render: (_, row) => (
              <Button
                danger
                disabled={row.name === "_id_"}
                onClick={() =>
                  modal.confirm({
                    title: "Drop index?",
                    content: row.name,
                    okButtonProps: { danger: true },
                    onOk: () => dropIndex(row.name),
                  })
                }
              >
                Drop
              </Button>
            ),
          },
        ]}
      />
      <Modal
        open={open}
        title="Create Index"
        onCancel={() => setOpen(false)}
        onOk={async () => {
          const name = await createIndex(keysJson, optionsJson);
          message.success(`Index created: ${name}`);
          setOpen(false);
        }}
        width={720}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input.TextArea
            value={keysJson}
            onChange={(event) => setKeysJson(event.target.value)}
            style={{ minHeight: 140, fontFamily: "Consolas, monospace" }}
          />
          <Input.TextArea
            value={optionsJson}
            onChange={(event) => setOptionsJson(event.target.value)}
            style={{ minHeight: 140, fontFamily: "Consolas, monospace" }}
          />
        </Space>
      </Modal>
    </Card>
  );
}
