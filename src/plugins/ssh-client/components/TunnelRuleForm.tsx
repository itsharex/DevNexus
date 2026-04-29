import { Form, Input, InputNumber, Modal, Select, Switch } from "antd";

import type { SshConnectionInfo, TunnelRuleForm as TunnelRuleFormData } from "@/plugins/ssh-client/types";

interface TunnelRuleFormProps {
  open: boolean;
  connections: SshConnectionInfo[];
  initial?: TunnelRuleFormData;
  onCancel: () => void;
  onSubmit: (values: TunnelRuleFormData) => void;
}

export function TunnelRuleForm({
  open,
  connections,
  initial,
  onCancel,
  onSubmit,
}: TunnelRuleFormProps) {
  const [form] = Form.useForm<TunnelRuleFormData>();
  const tunnelType = Form.useWatch("tunnelType", form);

  return (
    <Modal
      title={initial?.id ? "Edit Tunnel Rule" : "New Tunnel Rule"}
      open={open}
      destroyOnClose
      onCancel={onCancel}
      onOk={() => {
        void form.validateFields().then((values) => onSubmit(values));
      }}
      afterOpenChange={(visible) => {
        if (!visible) {
          return;
        }
        form.setFieldsValue(
          initial ?? {
            name: "",
            connectionId: connections[0]?.id,
            tunnelType: "local",
            localHost: "127.0.0.1",
            autoStart: false,
          },
        );
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Connection" name="connectionId" rules={[{ required: true }]}>
          <Select
            options={connections.map((item) => ({
              label: `${item.name} (${item.username}@${item.host}:${item.port})`,
              value: item.id,
            }))}
          />
        </Form.Item>
        <Form.Item label="Type" name="tunnelType" rules={[{ required: true }]}>
          <Select
            options={[
              { label: "Local", value: "local" },
              { label: "Remote", value: "remote" },
              { label: "Dynamic", value: "dynamic" },
            ]}
          />
        </Form.Item>

        {tunnelType === "local" ? (
          <>
            <Form.Item label="Local Host" name="localHost">
              <Input placeholder="127.0.0.1" />
            </Form.Item>
            <Form.Item label="Local Port" name="localPort" rules={[{ required: true }]}>
              <InputNumber min={1} max={65535} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="Remote Host" name="remoteHost" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Remote Port" name="remotePort" rules={[{ required: true }]}>
              <InputNumber min={1} max={65535} style={{ width: "100%" }} />
            </Form.Item>
          </>
        ) : null}

        {tunnelType === "remote" ? (
          <>
            <Form.Item label="Remote Port" name="remotePort" rules={[{ required: true }]}>
              <InputNumber min={1} max={65535} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="Local Host" name="localHost" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Local Port" name="localPort" rules={[{ required: true }]}>
              <InputNumber min={1} max={65535} style={{ width: "100%" }} />
            </Form.Item>
          </>
        ) : null}

        {tunnelType === "dynamic" ? (
          <Form.Item label="SOCKS Port" name="localPort" rules={[{ required: true }]}>
            <InputNumber min={1} max={65535} style={{ width: "100%" }} />
          </Form.Item>
        ) : null}

        <Form.Item label="Auto Start" name="autoStart" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
