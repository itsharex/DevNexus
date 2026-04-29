import { Form, Input, Modal } from "antd";

interface KeyImportFormProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (payload: { name: string; privateKeyPath: string; passphrase?: string }) => void;
}

export function KeyImportForm({ open, onCancel, onSubmit }: KeyImportFormProps) {
  const [form] = Form.useForm<{ name: string; privateKeyPath: string; passphrase?: string }>();

  return (
    <Modal
      title="Import SSH Key"
      open={open}
      onCancel={onCancel}
      onOk={() => {
        void form.validateFields().then((values) => {
          onSubmit(values);
          form.resetFields();
        });
      }}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input placeholder="prod-ed25519" />
        </Form.Item>
        <Form.Item
          label="Private Key Path"
          name="privateKeyPath"
          rules={[{ required: true }]}
        >
          <Input placeholder="C:\\Users\\xxx\\.ssh\\id_ed25519" />
        </Form.Item>
        <Form.Item label="Passphrase" name="passphrase">
          <Input.Password placeholder="optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
