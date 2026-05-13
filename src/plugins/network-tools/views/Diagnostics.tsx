import { Alert, Button, Card, Collapse, Descriptions, Form, Input, InputNumber, Select, Space, Tag, Typography, message } from "antd";
import { useEffect, useMemo } from "react";

import { useNetworkToolsStore } from "@/plugins/network-tools/store/network-tools";
import type { DnsLookupResult, NetworkResult, NetworkToolType, PingResult, TcpCheckResult, TracerouteResult } from "@/plugins/network-tools/types";

const toolOptions: Array<{ label: string; value: NetworkToolType }> = [
  { label: "TCP Port", value: "tcp" },
  { label: "Ping", value: "ping" },
  { label: "DNS", value: "dns" },
  { label: "Traceroute", value: "traceroute" },
];

function isTcpResult(result: NetworkResult): result is TcpCheckResult {
  return "connected" in result;
}

function isPingResult(result: NetworkResult): result is PingResult {
  return "rawOutput" in result && "target" in result && !("hops" in result);
}

function isDnsResult(result: NetworkResult): result is DnsLookupResult {
  return "addresses" in result;
}

function isTracerouteResult(result: NetworkResult): result is TracerouteResult {
  return "hops" in result;
}

function resultStatus(result: NetworkResult): { ok: boolean; label: string } {
  if (isTcpResult(result)) return { ok: result.connected, label: result.connected ? "Connected" : "Failed" };
  if ("success" in result) return { ok: result.success, label: result.success ? "Success" : "Failed" };
  if (isDnsResult(result)) return { ok: result.addresses.length > 0, label: result.addresses.length > 0 ? "Resolved" : "No Records" };
  return { ok: true, label: "Completed" };
}

function ResultPanel({ result }: { result: NetworkResult | null }) {
  const status = result ? resultStatus(result) : null;
  const summaryItems = useMemo(() => {
    if (!result) return [];
    if (isTcpResult(result)) {
      return [
        { key: "target", label: "Target", children: `${result.host}:${result.port}` },
        { key: "duration", label: "Duration", children: `${result.durationMs} ms` },
        { key: "remote", label: "Remote", children: result.remoteAddr ?? "-" },
        { key: "error", label: "Error", children: result.error ?? "-" },
      ];
    }
    if (isPingResult(result)) {
      return [
        { key: "target", label: "Target", children: result.target },
        { key: "duration", label: "Duration", children: `${result.durationMs} ms` },
        { key: "received", label: "Received", children: `${result.received ?? "?"}/${result.transmitted ?? "?"}` },
        { key: "avg", label: "Avg", children: result.avgMs == null ? "-" : `${result.avgMs} ms` },
        { key: "loss", label: "Loss", children: result.lossPercent == null ? "-" : `${result.lossPercent}%` },
      ];
    }
    if (isDnsResult(result)) {
      return [
        { key: "host", label: "Host", children: result.host },
        { key: "type", label: "Record", children: result.recordType },
        { key: "duration", label: "Duration", children: `${result.durationMs} ms` },
        { key: "records", label: "Records", children: result.addresses.join(", ") || "-" },
      ];
    }
    if (isTracerouteResult(result)) {
      return [
        { key: "target", label: "Target", children: result.target },
        { key: "duration", label: "Duration", children: `${result.durationMs} ms` },
        { key: "hops", label: "Hops", children: result.hops.length },
      ];
    }
    return [];
  }, [result]);

  if (!result || !status) {
    return <Card title="Result"><Typography.Text type="secondary">Run a diagnostic to see structured output here.</Typography.Text></Card>;
  }

  const rawText = JSON.stringify(result, null, 2);
  const rawOutput = "rawOutput" in result ? result.rawOutput : rawText;

  return <Card title={<Space>Result <Tag color={status.ok ? "green" : "red"}>{status.label}</Tag></Space>}>
    <Descriptions bordered size="small" column={2} items={summaryItems} />
    <Collapse style={{ marginTop: 12 }} items={[
      { key: "raw", label: "Raw Output", children: <pre style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto", margin: 0 }}>{rawOutput || rawText}</pre> },
      { key: "json", label: "Result JSON", children: <pre style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto", margin: 0 }}>{rawText}</pre> },
    ]} />
  </Card>;
}

export function Diagnostics() {
  const [form] = Form.useForm();
  const activeTool = useNetworkToolsStore((state) => state.activeTool);
  const setActiveTool = useNetworkToolsStore((state) => state.setActiveTool);
  const lastResult = useNetworkToolsStore((state) => state.lastResult);
  const loading = useNetworkToolsStore((state) => state.loading);
  const tcpCheck = useNetworkToolsStore((state) => state.tcpCheck);
  const ping = useNetworkToolsStore((state) => state.ping);
  const dnsLookup = useNetworkToolsStore((state) => state.dnsLookup);
  const traceroute = useNetworkToolsStore((state) => state.traceroute);

  useEffect(() => {
    form.setFieldsValue({ timeoutMs: 1000, count: 4, maxHops: 15, recordType: "A/AAAA", port: 443 });
  }, [form]);

  const run = async (values: Record<string, unknown>) => {
    try {
      if (activeTool === "tcp") await tcpCheck(String(values.host ?? ""), Number(values.port ?? 0), Number(values.timeoutMs ?? 5000));
      if (activeTool === "ping") await ping(String(values.target ?? ""), Number(values.count ?? 4), Number(values.timeoutMs ?? 5000));
      if (activeTool === "dns") await dnsLookup(String(values.host ?? ""), String(values.recordType ?? "A/AAAA"), Number(values.timeoutMs ?? 5000));
      if (activeTool === "traceroute") await traceroute(String(values.target ?? ""), Number(values.maxHops ?? 30), Number(values.timeoutMs ?? 5000));
      message.success("Diagnostic completed");
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  return <div style={{ height: "100%", minHeight: 0, overflow: "auto", paddingRight: 4 }}>
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card title="Network Diagnostics" extra={<Select value={activeTool} onChange={setActiveTool} options={toolOptions} style={{ width: 180 }} />}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Run one-shot connectivity checks and keep every result in local history for replay." />
        <Form form={form} layout="vertical" onFinish={run}>
          {activeTool === "tcp" ? <Space align="start" wrap>
            <Form.Item name="host" label="Host" rules={[{ required: true }]}><Input placeholder="example.com" style={{ width: 260 }} /></Form.Item>
            <Form.Item name="port" label="Port" rules={[{ required: true }]}><InputNumber min={1} max={65535} style={{ width: 120 }} /></Form.Item>
          </Space> : null}
          {activeTool === "ping" ? <Space align="start" wrap>
            <Form.Item name="target" label="Target" rules={[{ required: true }]}><Input placeholder="example.com" style={{ width: 260 }} /></Form.Item>
            <Form.Item name="count" label="Count"><InputNumber min={1} max={20} style={{ width: 120 }} /></Form.Item>
          </Space> : null}
          {activeTool === "dns" ? <Space align="start" wrap>
            <Form.Item name="host" label="Host" rules={[{ required: true }]}><Input placeholder="example.com" style={{ width: 260 }} /></Form.Item>
            <Form.Item name="recordType" label="Record"><Select style={{ width: 140 }} options={["A/AAAA", "A", "AAAA"].map((value) => ({ label: value, value }))} /></Form.Item>
          </Space> : null}
          {activeTool === "traceroute" ? <Space align="start" wrap>
            <Form.Item name="target" label="Target" rules={[{ required: true }]}><Input placeholder="example.com" style={{ width: 260 }} /></Form.Item>
            <Form.Item name="maxHops" label="Max Hops"><InputNumber min={1} max={64} style={{ width: 120 }} /></Form.Item>
          </Space> : null}
          <Form.Item name="timeoutMs" label="Timeout (ms)"><InputNumber min={500} max={120000} style={{ width: 160 }} /></Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>Run Diagnostic</Button>
        </Form>
      </Card>
      <ResultPanel result={lastResult} />
    </Space>
  </div>;
}
