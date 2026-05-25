import { Button, Drawer, Form, Input, List, message, Popconfirm, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";

import { useConfluenceStore } from "@/plugins/confluence/store/confluence";
import type { ConfluenceConnectionForm } from "@/plugins/confluence/types";

export function ConnectionSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<ConfluenceConnectionForm>();
  const connections = useConfluenceStore((s) => s.connections);
  const fetchConnections = useConfluenceStore((s) => s.fetchConnections);
  const saveConnection = useConfluenceStore((s) => s.saveConnection);
  const deleteConnection = useConfluenceStore((s) => s.deleteConnection);
  const testConnection = useConfluenceStore((s) => s.testConnection);
  const activeConnectionId = useConfluenceStore((s) => s.activeConnectionId);
  const setActiveConnectionId = useConfluenceStore((s) => s.setActiveConnectionId);
  const [testing, setTesting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) void fetchConnections();
  }, [open, fetchConnections]);

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      const result = await testConnection(values);
      if (result.success) {
        message.success(`Connected in ${result.durationMs}ms`);
      } else {
        message.error(result.error || "Connection failed");
      }
    } catch { /* validation error */ } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const finalForm = { ...values, id: editingId || undefined };
      const id = await saveConnection(finalForm);
      setActiveConnectionId(id);
      message.success("Connection saved");
      form.resetFields();
      setEditingId(null);
    } catch { /* validation error */ }
  };

  const handleEdit = (id: string) => {
    const conn = connections.find((c) => c.id === id);
    if (conn) {
      setEditingId(id);
      form.setFieldsValue({ label: conn.label, baseUrl: conn.baseUrl, username: conn.username, password: "" });
    }
  };

  const handleDelete = async (id: string) => {
    await deleteConnection(id);
    if (activeConnectionId === id) setActiveConnectionId(null);
    message.success("Deleted");
  };

  return (
    <Drawer title="Confluence Connections" open={open} onClose={onClose} width={420}>
      <Form form={form} layout="vertical" size="small">
        <Form.Item name="label" label="Label" rules={[{ required: true, message: "Required" }]}>
          <Input placeholder="My Confluence" />
        </Form.Item>
        <Form.Item name="baseUrl" label="Site URL" rules={[{ required: true, message: "Required" }]}>
          <Input placeholder="https://confluence.example.com" />
        </Form.Item>
        <Form.Item name="username" label="Username" rules={[{ required: true, message: "Required" }]}>
          <Input placeholder="admin" />
        </Form.Item>
        <Form.Item name="password" label="Password / Token" rules={[{ required: !editingId, message: "Required" }]}>
          <Input.Password placeholder="password or personal access token" />
        </Form.Item>
        <Space>
          <Button onClick={handleTest} loading={testing}>Test</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleSave}>
            {editingId ? "Update" : "Save"}
          </Button>
          {editingId && <Button onClick={() => { form.resetFields(); setEditingId(null); }}>Cancel</Button>}
        </Space>
      </Form>

      <Typography.Title level={5} style={{ marginTop: 24 }}>Saved Connections</Typography.Title>
      <List
        size="small"
        dataSource={connections}
        renderItem={(conn) => (
          <List.Item
            style={{ cursor: "pointer", background: conn.id === activeConnectionId ? "var(--ant-primary-1, #e6f4ff)" : undefined }}
            onClick={() => setActiveConnectionId(conn.id)}
            actions={[
              <Button size="small" type="text" onClick={(e) => { e.stopPropagation(); handleEdit(conn.id); }}>Edit</Button>,
              <Popconfirm title="Delete?" onConfirm={() => handleDelete(conn.id)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta title={conn.label} description={`${conn.baseUrl} (${conn.username})`} />
          </List.Item>
        )}
      />
    </Drawer>
  );
}
