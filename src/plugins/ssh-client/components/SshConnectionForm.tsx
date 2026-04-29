import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
} from "antd";
import { useEffect, useState } from "react";

import { useSshConnectionsStore } from "@/plugins/ssh-client/store/ssh-connections";
import { useSshKeysStore } from "@/plugins/ssh-client/store/keys";
import { KeyImportForm } from "@/plugins/ssh-client/components/KeyImportForm";
import type { SshConnectionFormData, SshConnectionInfo } from "@/plugins/ssh-client/types";

interface SshConnectionFormProps {
  open: boolean;
  initialValues?: SshConnectionInfo | null;
  allConnections: SshConnectionInfo[];
  onCancel: () => void;
  onSaved: () => void;
}

export function SshConnectionForm({
  open,
  initialValues,
  allConnections,
  onCancel,
  onSaved,
}: SshConnectionFormProps) {
  const [form] = Form.useForm<SshConnectionFormData>();
  const [importOpen, setImportOpen] = useState(false);
  const saveConnection = useSshConnectionsStore((state) => state.saveConnection);
  const testConnection = useSshConnectionsStore((state) => state.testConnection);
  const keys = useSshKeysStore((state) => state.keys);
  const fetchKeys = useSshKeysStore((state) => state.fetchKeys);
  const importKey = useSshKeysStore((state) => state.importKey);
  const { message } = App.useApp();

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue(
      initialValues
        ? {
            id: initialValues.id,
            name: initialValues.name,
            groupName: initialValues.groupName,
            host: initialValues.host,
            port: initialValues.port,
            username: initialValues.username,
            authType: initialValues.authType,
            keyId: initialValues.keyId,
            jumpHostId: initialValues.jumpHostId,
            encoding: initialValues.encoding,
            keepaliveInterval: initialValues.keepaliveInterval,
          }
        : {
            name: "",
            groupName: "",
            host: "",
            port: 22,
            username: "",
            authType: "password",
            password: "",
            encoding: "utf-8",
            keepaliveInterval: 30,
          },
    );
  }, [open, initialValues, form]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void fetchKeys();
  }, [open, fetchKeys]);

  const authType = Form.useWatch("authType", form);

  const onSubmit = async () => {
    const values = await form.validateFields();
    await saveConnection(values);
    message.success("SSH connection saved.");
    onSaved();
  };

  const onTest = async () => {
    const values = await form.validateFields();
    const result = await testConnection(values);
    message.info(`SSH handshake success: ${result.millis} ms`);
  };

  return (
    <Modal
      title={initialValues?.id ? "Edit SSH Connection" : "New SSH Connection"}
      open={open}
      onCancel={onCancel}
      onOk={() => void onSubmit()}
      destroyOnClose
      okText="Save"
      width={720}
      footer={(_, { OkBtn, CancelBtn }) => (
        <Space>
          <Button onClick={() => void onTest()}>Test Connection</Button>
          <CancelBtn />
          <OkBtn />
        </Space>
      )}
    >
      <Form form={form} layout="vertical">
        <Tabs
          items={[
            {
              key: "basic",
              label: "Basic",
              children: (
                <>
                  <Form.Item label="Name" name="name" rules={[{ required: true }]}>
                    <Input placeholder="SSH Dev Server" />
                  </Form.Item>
                  <Form.Item label="Group" name="groupName">
                    <Input placeholder="Default" />
                  </Form.Item>
                  <Space style={{ width: "100%" }}>
                    <Form.Item
                      label="Host"
                      name="host"
                      rules={[{ required: true }]}
                      style={{ flex: 1 }}
                    >
                      <Input placeholder="192.168.1.12" />
                    </Form.Item>
                    <Form.Item
                      label="Port"
                      name="port"
                      rules={[{ required: true, type: "number", min: 1, max: 65535 }]}
                      style={{ width: 140 }}
                    >
                      <InputNumber min={1} max={65535} style={{ width: "100%" }} />
                    </Form.Item>
                  </Space>
                  <Form.Item
                    label="Username"
                    name="username"
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="root" />
                  </Form.Item>
                  <Form.Item label="Auth Type" name="authType">
                    <Select
                      options={[
                        { label: "Password", value: "password" },
                        { label: "Key", value: "key" },
                        { label: "Key + Passphrase", value: "key_password" },
                      ]}
                    />
                  </Form.Item>
                  {authType === "password" ? (
                    <Form.Item label="Password" name="password" rules={[{ required: true }]}>
                      <Input.Password placeholder="password" />
                    </Form.Item>
                  ) : null}
                  {authType === "key" || authType === "key_password" ? (
                    <>
                      <Form.Item label="Key" name="keyId" rules={[{ required: true }]}>
                        <Select
                          placeholder="select key"
                          options={keys.map((item) => ({
                            label: `${item.name} (${item.keyType})`,
                            value: item.id,
                          }))}
                        />
                      </Form.Item>
                      <Form.Item label=" ">
                        <Button onClick={() => setImportOpen(true)}>Import Key File</Button>
                      </Form.Item>
                    </>
                  ) : null}
                  {authType === "key_password" ? (
                    <Form.Item
                      label="Key Passphrase"
                      name="keyPassphrase"
                      rules={[{ required: true }]}
                    >
                      <Input.Password placeholder="passphrase" />
                    </Form.Item>
                  ) : null}
                </>
              ),
            },
            {
              key: "advanced",
              label: "Advanced",
              children: (
                <>
                  <Form.Item label="Jump Host" name="jumpHostId">
                    <Select
                      allowClear
                      options={allConnections.map((item) => ({
                        label: `${item.name} (${item.username}@${item.host}:${item.port})`,
                        value: item.id,
                      }))}
                    />
                  </Form.Item>
                  <Space style={{ width: "100%" }}>
                    <Form.Item label="Encoding" name="encoding" style={{ flex: 1 }}>
                      <Select
                        options={[
                          { label: "UTF-8", value: "utf-8" },
                          { label: "GBK", value: "gbk" },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      label="Keepalive (seconds)"
                      name="keepaliveInterval"
                      style={{ width: 220 }}
                    >
                      <InputNumber min={5} max={600} style={{ width: "100%" }} />
                    </Form.Item>
                  </Space>
                </>
              ),
            },
          ]}
        />
      </Form>

      <KeyImportForm
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSubmit={(payload) => {
          void importKey(payload.name, payload.privateKeyPath, payload.passphrase)
            .then(async () => {
              await fetchKeys();
              const latest = useSshKeysStore.getState().keys[0];
              if (latest?.id) {
                form.setFieldValue("keyId", latest.id);
              }
              setImportOpen(false);
              message.success("Key imported. Please continue saving the SSH connection.");
            })
            .catch((err) => {
              message.error(String(err));
            });
        }}
      />
    </Modal>
  );
}
