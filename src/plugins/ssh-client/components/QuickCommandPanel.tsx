import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  List,
  Popconfirm,
  Space,
  Typography,
} from "antd";
import { useEffect } from "react";

import { useSshSessionsStore } from "@/plugins/ssh-client/store/sessions";

interface QuickCommandPanelProps {
  open: boolean;
  activeConnectionId?: string | null;
  activeSessionId?: string | null;
  onClose: () => void;
}

export function QuickCommandPanel({
  open,
  activeConnectionId,
  activeSessionId,
  onClose,
}: QuickCommandPanelProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ name: string; command: string }>();
  const quickCommands = useSshSessionsStore((state) => state.quickCommands);
  const loadQuickCommands = useSshSessionsStore((state) => state.loadQuickCommands);
  const saveQuickCommand = useSshSessionsStore((state) => state.saveQuickCommand);
  const deleteQuickCommand = useSshSessionsStore((state) => state.deleteQuickCommand);
  const sendInput = useSshSessionsStore((state) => state.sendInput);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadQuickCommands(activeConnectionId ?? undefined);
  }, [open, activeConnectionId, loadQuickCommands]);

  const onCreate = async () => {
    const values = await form.validateFields();
    await saveQuickCommand({
      connectionId: activeConnectionId ?? undefined,
      name: values.name,
      command: values.command,
    });
    form.resetFields();
    message.success("Quick command saved.");
  };

  const onRun = async (command: string) => {
    if (!activeSessionId) {
      message.warning("No active terminal tab.");
      return;
    }
    await sendInput(activeSessionId, `${command}\n`);
  };

  return (
    <Drawer
      open={open}
      width={420}
      title="Quick Commands"
      onClose={onClose}
      extra={
        <Typography.Text type="secondary">
          {activeConnectionId ? "Connection scope" : "Global scope"}
        </Typography.Text>
      }
    >
      <Space direction="vertical" style={{ width: "100%" }} size={16}>
        <Form form={form} layout="vertical">
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="List logs" />
          </Form.Item>
          <Form.Item label="Command" name="command" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="tail -n 200 /var/log/app.log" />
          </Form.Item>
          <Button type="primary" block onClick={() => void onCreate()}>
            Save Command
          </Button>
        </Form>

        <List
          bordered
          dataSource={quickCommands}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="run" type="link" onClick={() => void onRun(item.command)}>
                  Run
                </Button>,
                <Popconfirm
                  key="delete"
                  title="Delete this command?"
                  onConfirm={() => void deleteQuickCommand(item.id)}
                >
                  <Button type="link" danger>
                    Delete
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={item.name}
                description={
                  <Typography.Text code style={{ whiteSpace: "pre-wrap" }}>
                    {item.command}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      </Space>
    </Drawer>
  );
}
