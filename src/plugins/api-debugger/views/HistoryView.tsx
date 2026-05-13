import { Button, Card, Form, Input, List, Select, Space, Tag, Typography, message } from "antd";
import { useEffect } from "react";

import { useApiDebuggerStore } from "@/plugins/api-debugger/store/api-debugger";

export function HistoryView() {
  const [form] = Form.useForm();
  const history = useApiDebuggerStore((state) => state.history);
  const fetchHistory = useApiDebuggerStore((state) => state.fetchHistory);
  const deleteHistory = useApiDebuggerStore((state) => state.deleteHistory);
  const clearHistory = useApiDebuggerStore((state) => state.clearHistory);
  const openHistory = useApiDebuggerStore((state) => state.openHistory);
  const saveRequest = useApiDebuggerStore((state) => state.saveRequest);

  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  const filter = async (values: { method?: string; host?: string; status?: string }) => fetchHistory({ ...values, limit: 200 });

  return <div style={{ height: "100%", overflow: "auto", paddingRight: 4 }}>
    <Card title="History" extra={<Space><Button onClick={() => fetchHistory()}>Refresh</Button><Button danger onClick={clearHistory}>Clear</Button></Space>}>
      <Form form={form} layout="inline" onFinish={filter} style={{ marginBottom: 12 }}>
        <Form.Item name="method"><Select allowClear placeholder="Method" style={{ width: 130 }} options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({ label: value, value }))} /></Form.Item>
        <Form.Item name="host"><Input placeholder="Host contains" /></Form.Item>
        <Form.Item name="status"><Select allowClear placeholder="Status" style={{ width: 130 }} options={[{ label: "Success", value: "success" }, { label: "Error", value: "error" }]} /></Form.Item>
        <Button htmlType="submit">Filter</Button>
      </Form>
      <List dataSource={history} renderItem={(item) => <List.Item actions={[
        <Button size="small" onClick={() => openHistory(item)}>Open</Button>,
        <Button size="small" onClick={async () => { openHistory(item); await saveRequest(`${item.method} ${item.host || item.url}`); message.success("Saved from history"); }}>Save as Request</Button>,
        <Button size="small" danger onClick={() => deleteHistory(item.id)}>Delete</Button>,
      ]}>
        <List.Item.Meta title={<Space><Tag color="blue">{item.method}</Tag><Typography.Text>{item.url}</Typography.Text><Tag color={item.status === "success" ? "green" : "red"}>{item.statusCode ?? item.status}</Tag></Space>} description={`${item.durationMs} ms | ${item.createdAt}`} />
      </List.Item>} />
    </Card>
  </div>;
}
