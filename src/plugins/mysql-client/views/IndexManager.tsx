import { Button, Card, Form, Input, message, Modal, Popconfirm, Space, Switch, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { useMysqlConnectionsStore } from "@/plugins/mysql-client/store/mysql-connections";

export function IndexManager() {
  const { activeTable, columns, indexes, listIndexes, createIndex, dropIndex } = useMysqlConnectionsStore();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{ indexName: string; columns: string; unique: boolean }>();
  useEffect(() => { if (activeTable) void listIndexes(); }, [activeTable, listIndexes]);
  return <Card title="Indexes" extra={<Space><Button onClick={() => listIndexes()} disabled={!activeTable}>Refresh</Button><Button type="primary" disabled={!activeTable} onClick={() => setOpen(true)}>New Index</Button></Space>} style={{ height: "100%", overflow: "auto" }}>
    <Table rowKey="name" dataSource={indexes} columns={[{ title: "Name", dataIndex: "name" }, { title: "Columns", dataIndex: "columns", render: (items: string[]) => items.map((item) => <Tag key={item}>{item}</Tag>) }, { title: "Unique", dataIndex: "unique", render: (v) => v ? "YES" : "NO" }, { title: "Type", dataIndex: "indexType" }, { title: "Cardinality", dataIndex: "cardinality" }, { title: "Actions", render: (_, row) => row.name === "PRIMARY" ? null : <Popconfirm title="Drop index?" onConfirm={async () => { await dropIndex(row.name); message.success("Dropped"); }}><Button danger size="small">Drop</Button></Popconfirm> }]} />
    <Modal open={open} title="New Index" onCancel={() => setOpen(false)} onOk={async () => { const value = await form.validateFields(); await createIndex(value.indexName, value.columns.split(',').map((item) => item.trim()).filter(Boolean), value.unique); setOpen(false); message.success("Created"); }}><Form form={form} layout="vertical"><Form.Item name="indexName" label="Index Name" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="columns" label="Columns (comma separated)" rules={[{ required: true }]} tooltip={columns.map((item) => item.name).join(', ')}><Input /></Form.Item><Form.Item name="unique" label="Unique" valuePropName="checked"><Switch /></Form.Item></Form></Modal>
  </Card>;
}
