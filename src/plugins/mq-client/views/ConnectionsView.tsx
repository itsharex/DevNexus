import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import { useEffect, useState } from "react";

import { useMqStore } from "@/plugins/mq-client/store/mq-client";
import type { MqBrokerType, MqConnectionFormData, MqConnectionInfo } from "@/plugins/mq-client/types";
import { defaultMqConnection } from "@/plugins/mq-client/utils/mq";

export function ConnectionsView() {
  const [form] = Form.useForm<MqConnectionFormData>();
  const [open, setOpen] = useState(false);
  const [brokerType, setBrokerType] = useState<MqBrokerType>("rabbitmq");
  const connections = useMqStore((state) => state.connections);
  const fetchConnections = useMqStore((state) => state.fetchConnections);
  const saveConnection = useMqStore((state) => state.saveConnection);
  const deleteConnection = useMqStore((state) => state.deleteConnection);
  const testConnection = useMqStore((state) => state.testConnection);
  const connect = useMqStore((state) => state.connect);
  const diagnostics = useMqStore((state) => state.lastDiagnostics);

  useEffect(() => { void fetchConnections(); }, [fetchConnections]);

  const edit = (record?: MqConnectionInfo) => {
    const initial = record ?? defaultMqConnection(brokerType);
    setBrokerType(initial.brokerType);
    form.setFieldsValue({ ...initial, password: undefined, rabbitmq: { ...initial.rabbitmq, managementPassword: undefined }, kafka: { ...initial.kafka, saslPassword: undefined } });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    await saveConnection(values);
    message.success("MQ connection saved");
    setOpen(false);
  };

  return <Card title="MQ Connections" extra={<Button type="primary" onClick={() => edit()}>New</Button>}>
    <Table rowKey="id" dataSource={connections} pagination={{ pageSize: 8 }} columns={[
      { title: "Name", dataIndex: "name" },
      { title: "Type", dataIndex: "brokerType", render: (value: string) => <Tag color={value === "rabbitmq" ? "green" : "blue"}>{value}</Tag> },
      { title: "Hosts", render: (_: unknown, record: MqConnectionInfo) => record.hosts.join(", ") },
      { title: "Group", dataIndex: "groupName" },
      { title: "Actions", render: (_: unknown, record: MqConnectionInfo) => <Space>
        <Button size="small" onClick={() => connect(record.id)}>Connect</Button>
        <Button size="small" onClick={async () => { const result = await testConnection(record.id); message[result.success ? "success" : "error"](result.summary); }}>Test</Button>
        <Button size="small" onClick={() => edit(record)}>Edit</Button>
        <Button size="small" onClick={() => edit({ ...record, id: undefined as unknown as string, name: `${record.name} copy` })}>Copy</Button>
        <Button danger size="small" onClick={() => deleteConnection(record.id)}>Delete</Button>
      </Space> },
    ]} />
    {diagnostics ? <Card size="small" title="Last Diagnostics" style={{ marginTop: 12 }}>
      <Typography.Text type={diagnostics.success ? "success" : "danger"}>{diagnostics.summary}</Typography.Text>
      {diagnostics.stages.map((stage) => <div key={stage.name}><Tag>{stage.name}</Tag><Tag color={stage.status === "ok" ? "success" : stage.status === "warning" ? "warning" : "error"}>{stage.status}</Tag>{stage.message}</div>)}
    </Card> : null}
    <Modal open={open} title="MQ Connection" onCancel={() => setOpen(false)} onOk={submit} width={760} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={defaultMqConnection(brokerType)}>
        <Form.Item name="id" hidden><Input /></Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="groupName" label="Group"><Input /></Form.Item>
        <Form.Item name="brokerType" label="Broker" rules={[{ required: true }]}><Select options={[{ label: "RabbitMQ", value: "rabbitmq" }, { label: "Kafka", value: "kafka" }]} onChange={(value) => { setBrokerType(value); form.setFieldsValue(defaultMqConnection(value)); }} /></Form.Item>
        <Form.Item name="hosts" label="Hosts" rules={[{ required: true }]} normalize={(value) => typeof value === "string" ? value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean) : value}>
          <Input.TextArea rows={2} placeholder="One host per line or comma separated" />
        </Form.Item>
        <Space style={{ width: "100%" }} align="start">
          <Form.Item name="username" label="Username"><Input /></Form.Item>
          <Form.Item name="password" label="Password"><Input.Password placeholder="Leave blank to keep existing" /></Form.Item>
          <Form.Item name="connectTimeout" label="Timeout(s)"><InputNumber min={1} max={60} /></Form.Item>
        </Space>
        {brokerType === "rabbitmq" ? <>
          <Form.Item name={["rabbitmq", "amqpUrl"]} label="AMQP URL"><Input placeholder="amqp://user:pass@host:5672/%2f" /></Form.Item>
          <Form.Item name={["rabbitmq", "virtualHost"]} label="Virtual Host"><Input /></Form.Item>
          <Form.Item name={["rabbitmq", "managementUrl"]} label="Management URL"><Input placeholder="http://host:15672" /></Form.Item>
          <Space style={{ width: "100%" }} align="start">
            <Form.Item name={["rabbitmq", "managementUsername"]} label="Management Username"><Input /></Form.Item>
            <Form.Item name={["rabbitmq", "managementPassword"]} label="Management Password"><Input.Password placeholder="Leave blank to keep existing" /></Form.Item>
          </Space>
        </> : <>
          <Form.Item name={["kafka", "bootstrapServers"]} label="Bootstrap Servers" normalize={(value) => typeof value === "string" ? value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean) : value}><Input.TextArea rows={2} /></Form.Item>
          <Space style={{ width: "100%" }} align="start">
            <Form.Item name={["kafka", "clientId"]} label="Client ID"><Input /></Form.Item>
            <Form.Item name={["kafka", "securityProtocol"]} label="Security"><Select options={[{ label: "PLAINTEXT", value: "PLAINTEXT" }, { label: "SASL_PLAINTEXT", value: "SASL_PLAINTEXT" }]} /></Form.Item>
            <Form.Item name={["kafka", "saslMechanism"]} label="SASL"><Select options={[{ label: "PLAIN", value: "PLAIN" }]} /></Form.Item>
          </Space>
          <Space style={{ width: "100%" }} align="start">
            <Form.Item name={["kafka", "saslUsername"]} label="SASL Username"><Input /></Form.Item>
            <Form.Item name={["kafka", "saslPassword"]} label="SASL Password"><Input.Password placeholder="Leave blank to keep existing" /></Form.Item>
          </Space>
        </>}
      </Form>
    </Modal>
  </Card>;
}
