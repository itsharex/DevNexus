import { Button, Card, Popconfirm, Space, Table, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";

import { useNetworkToolsStore } from "@/plugins/network-tools/store/network-tools";
import type { NetworkHistoryItem } from "@/plugins/network-tools/types";

function formatJson(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}

export function History() {
  const history = useNetworkToolsStore((state) => state.history);
  const loading = useNetworkToolsStore((state) => state.loading);
  const fetchHistory = useNetworkToolsStore((state) => state.fetchHistory);
  const deleteHistory = useNetworkToolsStore((state) => state.deleteHistory);
  const clearHistory = useNetworkToolsStore((state) => state.clearHistory);
  const rerunHistory = useNetworkToolsStore((state) => state.rerunHistory);
  const [selected, setSelected] = useState<NetworkHistoryItem | null>(null);

  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  const columns = useMemo(() => [
    { title: "Time", dataIndex: "createdAt", width: 190 },
    { title: "Tool", dataIndex: "toolType", width: 110, render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
    { title: "Target", dataIndex: "target", ellipsis: true },
    { title: "Status", dataIndex: "status", width: 110, render: (value: string) => <Tag color={value === "success" ? "green" : "red"}>{value}</Tag> },
    { title: "Duration", dataIndex: "durationMs", width: 110, render: (value: number) => `${value} ms` },
    { title: "Summary", dataIndex: "summary", ellipsis: true },
    {
      title: "Actions",
      key: "actions",
      width: 260,
      render: (_: unknown, item: NetworkHistoryItem) => <Space>
        <Button size="small" onClick={() => setSelected(item)}>Detail</Button>
        <Button size="small" onClick={async () => { await rerunHistory(item); message.success("Diagnostic rerun completed"); }}>Rerun</Button>
        <Button size="small" onClick={() => navigator.clipboard?.writeText(item.target)}>Copy</Button>
        <Popconfirm title="Delete this history item?" onConfirm={() => deleteHistory(item.id)}>
          <Button size="small" danger>Delete</Button>
        </Popconfirm>
      </Space>,
    },
  ], [deleteHistory, rerunHistory]);

  return <div style={{ height: "100%", minHeight: 0, overflow: "auto", paddingRight: 4 }}>
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card title="Diagnostic History" extra={<Space>
        <Button onClick={() => fetchHistory()}>Refresh</Button>
        <Popconfirm title="Clear all network diagnostic history?" onConfirm={() => clearHistory()}>
          <Button danger>Clear</Button>
        </Popconfirm>
      </Space>}>
        <Table<NetworkHistoryItem>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={history}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          scroll={{ x: 1120 }}
        />
      </Card>
      {selected ? <Card title={`History Detail - ${selected.toolType.toUpperCase()}`} extra={<Button onClick={() => setSelected(null)}>Close</Button>}>
        <Typography.Paragraph><Typography.Text strong>Target:</Typography.Text> {selected.target}</Typography.Paragraph>
        <Typography.Paragraph><Typography.Text strong>Summary:</Typography.Text> {selected.summary}</Typography.Paragraph>
        <Typography.Title level={5}>Params</Typography.Title>
        <pre style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" }}>{formatJson(selected.paramsJson)}</pre>
        <Typography.Title level={5}>Result</Typography.Title>
        <pre style={{ whiteSpace: "pre-wrap", maxHeight: 360, overflow: "auto" }}>{formatJson(selected.resultJson)}</pre>
      </Card> : null}
    </Space>
  </div>;
}
