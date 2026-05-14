import { Button, Card, Form, Input, InputNumber, Radio, Select, Space, Tabs, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";

import { useMqStore } from "@/plugins/mq-client/store/mq-client";
import type { MqConsumeRequest, MqKeyValue, MqPublishRequest, MqSavedMessage } from "@/plugins/mq-client/types";
import { safeJson, textBody } from "@/plugins/mq-client/utils/mq";

function parsePairs(text?: string): MqKeyValue[] {
  return (text ?? "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [key, ...rest] = line.split(":");
    return { key: key.trim(), value: rest.join(":").trim(), enabled: true };
  });
}

export function MessageStudio() {
  const [publishForm] = Form.useForm();
  const [consumeForm] = Form.useForm();
  const [templateName, setTemplateName] = useState("");
  const activeConnId = useMqStore((state) => state.activeConnId);
  const connections = useMqStore((state) => state.connections);
  const publish = useMqStore((state) => state.publish);
  const consumePreview = useMqStore((state) => state.consumePreview);
  const lastResult = useMqStore((state) => state.lastResult);
  const templates = useMqStore((state) => state.templates);
  const fetchTemplates = useMqStore((state) => state.fetchTemplates);
  const saveTemplate = useMqStore((state) => state.saveTemplate);
  const active = useMemo(() => connections.find((item) => item.id === activeConnId), [activeConnId, connections]);

  useEffect(() => { if (active) void fetchTemplates(active.brokerType); }, [active, fetchTemplates]);

  if (!active) return <Card><Typography.Text type="secondary">Connect to RabbitMQ or Kafka first.</Typography.Text></Card>;

  const runPublish = async () => {
    const values = await publishForm.validateFields();
    const request: MqPublishRequest = {
      connId: active.id,
      brokerType: active.brokerType,
      target: values.target ?? "",
      routingKey: values.routingKey,
      key: values.key,
      partition: values.partition,
      headers: parsePairs(values.headers),
      properties: parsePairs(values.properties),
      body: textBody(values.body ?? "", values.contentType),
      saveHistory: true,
    };
    const result = await publish(request);
    message[result.status === "success" ? "success" : "error"](result.summary);
  };

  const runConsume = async () => {
    const values = await consumeForm.validateFields();
    const request: MqConsumeRequest = { connId: active.id, brokerType: active.brokerType, target: values.target, partition: values.partition, offsetMode: values.offsetMode, offset: values.offset, limit: values.limit, timeoutMs: values.timeoutMs, ackMode: values.ackMode, saveHistory: true };
    const result = await consumePreview(request);
    message[result.status === "success" ? "success" : "error"](result.summary);
  };

  const saveCurrentTemplate = async () => {
    const values = await publishForm.validateFields();
    await saveTemplate({ brokerType: active.brokerType, name: templateName || values.target || "Untitled template", target: values.target, body: textBody(values.body ?? "", values.contentType), headers: parsePairs(values.headers), properties: parsePairs(values.properties) });
    message.success("Template saved");
  };

  const applyTemplate = (id: string) => {
    const tpl = templates.find((item: MqSavedMessage) => item.id === id);
    if (!tpl) return;
    publishForm.setFieldsValue({ target: tpl.target, body: tpl.body.text, contentType: tpl.body.contentType, headers: tpl.headers.map((item) => `${item.key}: ${item.value}`).join("\n"), properties: tpl.properties.map((item) => `${item.key}: ${item.value}`).join("\n") });
  };

  return <div style={{ display: "grid", gridTemplateColumns: "minmax(420px, 1fr) minmax(420px, 1fr)", gap: 12, height: "100%" }}>
    <Card title={`Message Studio / ${active.brokerType}`}>
      <Tabs items={[
        { key: "publish", label: active.brokerType === "rabbitmq" ? "Publish" : "Produce", children: <Form form={publishForm} layout="vertical" initialValues={{ contentType: "application/json", body: "{}" }}>
          <Form.Item name="target" label={active.brokerType === "rabbitmq" ? "Exchange (empty = default exchange)" : "Topic"} rules={active.brokerType === "kafka" ? [{ required: true }] : []}><Input placeholder={active.brokerType === "rabbitmq" ? "Leave empty to publish to the default exchange" : "topic-name"} /></Form.Item>
          {active.brokerType === "rabbitmq" ? <Form.Item name="routingKey" label="Routing Key / Queue" rules={[{ required: true }]}><Input placeholder="queue name when exchange is empty" /></Form.Item> : <Space align="start"><Form.Item name="key" label="Key"><Input /></Form.Item><Form.Item name="partition" label="Partition"><InputNumber /></Form.Item></Space>}
          <Form.Item name="contentType" label="Content-Type"><Input /></Form.Item>
          <Form.Item name="headers" label="Headers"><Input.TextArea rows={3} placeholder="key: value" /></Form.Item>
          {active.brokerType === "rabbitmq" ? <Form.Item name="properties" label="Properties"><Input.TextArea rows={2} placeholder="deliveryMode: 2" /></Form.Item> : null}
          <Form.Item name="body" label="Body"><Input.TextArea rows={8} /></Form.Item>
          <Space><Button type="primary" onClick={runPublish}>{active.brokerType === "rabbitmq" ? "Publish" : "Produce"}</Button><Input placeholder="Template name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} /><Button onClick={saveCurrentTemplate}>Save Template</Button><Select style={{ width: 180 }} placeholder="Apply template" options={templates.map((item) => ({ label: item.name, value: item.id }))} onChange={applyTemplate} /></Space>
        </Form> },
        { key: "consume", label: "Preview Consume", children: <Form form={consumeForm} layout="vertical" initialValues={{ limit: 10, timeoutMs: 10000, ackMode: "requeue", offsetMode: "latest" }}>
          <Form.Item name="target" label={active.brokerType === "rabbitmq" ? "Queue" : "Topic"} rules={[{ required: true }]}><Input /></Form.Item>
          {active.brokerType === "rabbitmq" ? <Form.Item name="ackMode" label="Ack Mode"><Radio.Group options={[{ label: "Nack + Requeue (safe default)", value: "requeue" }, { label: "Ack", value: "ack" }]} /></Form.Item> : <Space align="start"><Form.Item name="offsetMode" label="Offset"><Select options={[{ label: "Latest", value: "latest" }, { label: "Earliest", value: "earliest" }, { label: "Specific", value: "specific" }]} /></Form.Item><Form.Item name="partition" label="Partition"><InputNumber /></Form.Item><Form.Item name="offset" label="Offset"><InputNumber /></Form.Item></Space>}
          <Space align="start"><Form.Item name="limit" label="Limit"><InputNumber min={1} max={100} /></Form.Item><Form.Item name="timeoutMs" label="Timeout(ms)"><InputNumber min={500} max={30000} /></Form.Item></Space>
          <Typography.Paragraph type="secondary">Safe default: RabbitMQ requeues messages unless Ack is selected; Kafka preview does not commit offsets.</Typography.Paragraph>
          <Button type="primary" onClick={runConsume}>Preview</Button>
        </Form> },
      ]} />
    </Card>
    <Card title="Result" style={{ overflow: "auto" }}>
      {lastResult ? <>
        <Typography.Text type={lastResult.status === "success" ? "success" : "danger"}>{lastResult.summary}</Typography.Text>
        <pre className="devnexus-api-preview">{safeJson(JSON.stringify(lastResult, null, 2))}</pre>
      </> : <Typography.Text type="secondary">No result yet.</Typography.Text>}
    </Card>
  </div>;
}
