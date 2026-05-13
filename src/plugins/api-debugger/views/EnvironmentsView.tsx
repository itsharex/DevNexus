import { Button, Card, Checkbox, Form, Input, List, Space, Tag, message } from "antd";
import { useEffect, useState } from "react";

import { useApiDebuggerStore } from "@/plugins/api-debugger/store/api-debugger";
import type { ApiKeyValue } from "@/plugins/api-debugger/types";
import { emptyKeyValue } from "@/plugins/api-debugger/utils/api-debugger";

export function EnvironmentsView() {
  const [form] = Form.useForm();
  const environments = useApiDebuggerStore((state) => state.environments);
  const activeEnvironmentId = useApiDebuggerStore((state) => state.activeEnvironmentId);
  const fetchAll = useApiDebuggerStore((state) => state.fetchAll);
  const saveEnvironment = useApiDebuggerStore((state) => state.saveEnvironment);
  const deleteEnvironment = useApiDebuggerStore((state) => state.deleteEnvironment);
  const setActiveEnvironment = useApiDebuggerStore((state) => state.setActiveEnvironment);
  const [editingId, setEditingId] = useState<string | undefined>();
  const variables = Form.useWatch("variables", form) as ApiKeyValue[] | undefined;

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const save = async (values: { name: string; variables?: ApiKeyValue[] }) => {
    await saveEnvironment(values.name, values.variables ?? [], editingId);
    form.resetFields();
    setEditingId(undefined);
    message.success("Environment saved");
  };

  const edit = (id: string) => {
    const env = environments.find((item) => item.id === id);
    if (!env) return;
    setEditingId(env.id);
    form.setFieldsValue({ name: env.name, variables: env.variables });
  };

  const rows = variables?.length ? variables : [emptyKeyValue()];
  const setRows = (next: ApiKeyValue[]) => form.setFieldValue("variables", next);

  return <div style={{ height: "100%", overflow: "auto", paddingRight: 4 }}>
    <Space align="start" style={{ width: "100%" }}>
      <Card title="Environments" style={{ flex: 1 }}>
        <List dataSource={environments} renderItem={(env) => <List.Item actions={[
          <Button size="small" type={activeEnvironmentId === env.id ? "primary" : "default"} onClick={() => setActiveEnvironment(env.id)}>Use</Button>,
          <Button size="small" onClick={() => edit(env.id)}>Edit</Button>,
          <Button size="small" danger onClick={() => deleteEnvironment(env.id)}>Delete</Button>,
        ]}><List.Item.Meta title={<Space>{env.name}{activeEnvironmentId === env.id ? <Tag color="green">active</Tag> : null}</Space>} description={`${env.variables.length} variables`} /></List.Item>} />
      </Card>
      <Card title={editingId ? "Edit Environment" : "New Environment"} style={{ width: 620 }}>
        <Form form={form} layout="vertical" onFinish={save} initialValues={{ variables: [emptyKeyValue()] }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="Local / Staging / Production" /></Form.Item>
          <Space direction="vertical" style={{ width: "100%" }}>
            {rows.map((row, idx) => <Space key={idx}>
              <Checkbox checked={row.enabled} onChange={(event) => setRows(rows.map((item, rowIdx) => rowIdx === idx ? { ...item, enabled: event.target.checked } : item))} />
              <Input value={row.key} onChange={(event) => setRows(rows.map((item, rowIdx) => rowIdx === idx ? { ...item, key: event.target.value } : item))} placeholder="baseUrl" />
              <Input.Password value={row.value} onChange={(event) => setRows(rows.map((item, rowIdx) => rowIdx === idx ? { ...item, value: event.target.value } : item))} placeholder="value" />
              <Checkbox checked={row.secret} onChange={(event) => setRows(rows.map((item, rowIdx) => rowIdx === idx ? { ...item, secret: event.target.checked } : item))}>secret</Checkbox>
            </Space>)}
          </Space>
          <Space style={{ marginTop: 12 }}><Button onClick={() => setRows([...rows, emptyKeyValue()])}>Add Variable</Button><Button type="primary" htmlType="submit">Save</Button></Space>
        </Form>
      </Card>
    </Space>
  </div>;
}
