import { App, Button, Form, Input, InputNumber, Modal, Radio, Space, Switch, Tabs } from "antd";
import { useEffect, useState } from "react";

import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";
import type { MongoConnectionFormData, MongoConnectionInfo } from "@/plugins/mongodb-client/types";

interface MongoConnectionFormProps {
  open: boolean;
  initial?: MongoConnectionInfo | null;
  onClose: () => void;
}

export function MongoConnectionForm({ open, initial, onClose }: MongoConnectionFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<MongoConnectionFormData>();
  const mode = Form.useWatch("mode", form) ?? "uri";
  const saveConnection = useMongoConnectionsStore((state) => state.saveConnection);
  const testConnection = useMongoConnectionsStore((state) => state.testConnection);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      id: initial?.id,
      name: initial?.name ?? "",
      groupName: initial?.groupName ?? "",
      mode: initial?.mode ?? "uri",
      host: initial?.host ?? "localhost",
      port: initial?.port ?? 27017,
      username: initial?.username ?? "",
      authDatabase: initial?.authDatabase ?? "admin",
      defaultDatabase: initial?.defaultDatabase ?? "",
      replicaSet: initial?.replicaSet ?? "",
      tls: initial?.tls ?? false,
      srv: initial?.srv ?? false,
      uri: "",
      password: "",
    });
  }, [form, initial, open]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await saveConnection(values);
      message.success("MongoDB connection saved");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    const values = await form.validateFields();
    setTesting(true);
    try {
      const result = await testConnection(values);
      message.success(`Connected in ${result.millis} ms${result.serverVersion ? ` / ${result.serverVersion}` : ""}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={initial ? "Edit MongoDB Connection" : "New MongoDB Connection"}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={saving}
      width={720}
      destroyOnHidden
      footer={(_, { CancelBtn, OkBtn }) => (
        <Space>
          <Button loading={testing} onClick={test}>
            Test
          </Button>
          <CancelBtn />
          <OkBtn />
        </Space>
      )}
    >
      <Form form={form} layout="vertical" initialValues={{ mode: "uri", port: 27017, authDatabase: "admin" }}>
        <Form.Item name="id" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input placeholder="Production MongoDB" />
        </Form.Item>
        <Form.Item name="groupName" label="Group">
          <Input placeholder="DEV / PROD" />
        </Form.Item>
        <Form.Item name="mode" label="Connection Mode">
          <Radio.Group
            options={[
              { label: "URI", value: "uri" },
              { label: "Form", value: "form" },
            ]}
          />
        </Form.Item>
        <Tabs
          items={[
            {
              key: "basic",
              label: "Basic",
              children:
                mode === "uri" ? (
                  <Form.Item
                    name="uri"
                    label="MongoDB URI"
                    rules={[{ required: !initial, message: "URI is required for new URI connections" }]}
                    extra={initial ? "Leave blank to keep the saved encrypted URI." : undefined}
                  >
                    <Input.Password placeholder="mongodb://user:password@localhost:27017/admin" />
                  </Form.Item>
                ) : (
                  <>
                    <Form.Item name="host" label="Host" rules={[{ required: true }]}>
                      <Input placeholder="localhost" />
                    </Form.Item>
                    <Form.Item name="port" label="Port" rules={[{ required: true }]}>
                      <InputNumber min={1} max={65535} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item name="username" label="Username">
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label="Password"
                      extra={initial ? "Leave blank to keep the saved encrypted password." : undefined}
                    >
                      <Input.Password />
                    </Form.Item>
                  </>
                ),
            },
            {
              key: "advanced",
              label: "Advanced",
              children: (
                <>
                  <Form.Item name="authDatabase" label="Auth Database">
                    <Input placeholder="admin" />
                  </Form.Item>
                  <Form.Item name="defaultDatabase" label="Default Database">
                    <Input placeholder="optional" />
                  </Form.Item>
                  <Form.Item name="replicaSet" label="Replica Set">
                    <Input placeholder="rs0" />
                  </Form.Item>
                  <Space size={24}>
                    <Form.Item name="tls" label="TLS" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="srv" label="SRV" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </Space>
                </>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}
