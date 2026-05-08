import { Button, Form, Input, InputNumber, message, Modal, Select, Space } from "antd";
import { useEffect } from "react";

import { useMysqlConnectionsStore } from "@/plugins/mysql-client/store/mysql-connections";
import type { MysqlConnectionFormData, MysqlConnectionInfo } from "@/plugins/mysql-client/types";

interface Props { open: boolean; initial?: MysqlConnectionInfo | null; onClose: () => void }

export function MysqlConnectionForm({ open, initial, onClose }: Props) {
  const [form] = Form.useForm<MysqlConnectionFormData>();
  const saveConnection = useMysqlConnectionsStore((state) => state.saveConnection);
  const testConnection = useMysqlConnectionsStore((state) => state.testConnection);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(initial ? { ...initial, password: "" } : { port: 3306, charset: "utf8mb4", sslMode: "preferred", connectTimeout: 10 });
  }, [form, initial, open]);

  const values = async () => ({ ...form.getFieldsValue(), id: initial?.id });

  return (
    <Modal title={initial ? "Edit MySQL Connection" : "New MySQL Connection"} open={open} onCancel={onClose} onOk={async () => { await saveConnection(await values()); message.success("MySQL connection saved"); onClose(); }} destroyOnHidden width={720}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="Production MySQL" /></Form.Item>
        <Form.Item name="groupName" label="Group"><Input placeholder="DEV / TEST / PROD" /></Form.Item>
        <Space style={{ width: "100%" }} align="start">
          <Form.Item name="host" label="Host" rules={[{ required: true }]} style={{ width: 360 }}><Input placeholder="127.0.0.1" /></Form.Item>
          <Form.Item name="port" label="Port" rules={[{ required: true }]}><InputNumber min={1} max={65535} /></Form.Item>
        </Space>
        <Space style={{ width: "100%" }} align="start">
          <Form.Item name="username" label="Username" rules={[{ required: true }]} style={{ width: 240 }}><Input /></Form.Item>
          <Form.Item name="password" label="Password" style={{ width: 240 }}><Input.Password placeholder={initial ? "Leave blank to keep" : undefined} /></Form.Item>
        </Space>
        <Space style={{ width: "100%" }} align="start">
          <Form.Item name="defaultDatabase" label="Default Database" style={{ width: 220 }}><Input /></Form.Item>
          <Form.Item name="charset" label="Charset" style={{ width: 160 }}><Input /></Form.Item>
          <Form.Item name="sslMode" label="SSL Mode" style={{ width: 160 }}><Select options={["preferred", "disabled", "required"].map((value) => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="connectTimeout" label="Timeout(s)"><InputNumber min={1} max={120} /></Form.Item>
        </Space>
        <Button onClick={async () => { const result = await testConnection(await values()); message.success(`Connected in ${result.millis} ms${result.serverVersion ? `, ${result.serverVersion}` : ""}`); }}>Test Connection</Button>
      </Form>
    </Modal>
  );
}
