import { App, Button, Form, Input, InputNumber, Modal, Select, Space } from "antd";
import { useEffect } from "react";

import type { ConnectionFormData } from "@/plugins/redis-manager/types";
import { useConnectionsStore } from "@/plugins/redis-manager/store/connections";

interface ConnectionFormProps {
  open: boolean;
  initialValues?: ConnectionFormData | null;
  onCancel: () => void;
  onSaved: () => void;
}

export function ConnectionForm({
  open,
  initialValues,
  onCancel,
  onSaved,
}: ConnectionFormProps) {
  const [form] = Form.useForm<ConnectionFormData>();
  const saveConnection = useConnectionsStore((state) => state.saveConnection);
  const testConnection = useConnectionsStore((state) => state.testConnection);
  const { message } = App.useApp();

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue(
      initialValues ?? {
        name: "",
        groupName: "",
        host: "",
        port: 6379,
        password: "",
        dbIndex: 0,
        connectionType: "Standalone",
      },
    );
  }, [open, initialValues, form]);

  const onSubmit = async () => {
    const values = await form.validateFields();
    await saveConnection(values);
    onSaved();
    message.success("Connection saved.");
  };

  const onTest = async () => {
    const values = await form.validateFields();
    const result = await testConnection(values);
    message.info(`Connection latency: ${result.millis} ms`);
  };

  return (
    <Modal
      title={initialValues?.id ? "Edit Connection" : "New Connection"}
      open={open}
      onCancel={onCancel}
      onOk={() => void onSubmit()}
      destroyOnClose
      okText="Save"
      footer={(_, { OkBtn, CancelBtn }) => (
        <Space>
          <Button onClick={() => void onTest()}>Test Connection</Button>
          <CancelBtn />
          <OkBtn />
        </Space>
      )}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input placeholder="Redis Dev" />
        </Form.Item>
        <Form.Item label="Group" name="groupName">
          <Input placeholder="Default" />
        </Form.Item>
        <Form.Item label="Host" name="host" rules={[{ required: true }]}>
          <Input placeholder="127.0.0.1" />
        </Form.Item>
        <Form.Item
          label="Port"
          name="port"
          rules={[
            { required: true },
            { type: "number", min: 1, max: 65535, message: "1-65535" },
          ]}
        >
          <InputNumber min={1} max={65535} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="Password" name="password">
          <Input.Password placeholder="optional" />
        </Form.Item>
        <Form.Item label="DB" name="dbIndex">
          <Select
            options={Array.from({ length: 16 }, (_, idx) => ({
              label: String(idx),
              value: idx,
            }))}
          />
        </Form.Item>
        <Form.Item label="Connection Type" name="connectionType">
          <Select
            options={[
              { label: "Standalone", value: "Standalone" },
              { label: "Sentinel (reserved)", value: "Sentinel", disabled: true },
              { label: "Cluster (reserved)", value: "Cluster", disabled: true },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
