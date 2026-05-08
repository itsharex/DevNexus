import { Button, Card, Drawer, Input, List, message, Modal, Space, Table, Tabs, Typography } from "antd";
import { useState } from "react";
import { useMysqlConnectionsStore } from "@/plugins/mysql-client/store/mysql-connections";
import type { MysqlSqlResult } from "@/plugins/mysql-client/types";

function isDangerous(sql: string): boolean {
  const normalized = sql.trim().toLowerCase();
  return /^(drop|truncate|alter)\b/.test(normalized) || (/^delete\b/.test(normalized) && !/\bwhere\b/.test(normalized)) || (/^update\b/.test(normalized) && !/\bwhere\b/.test(normalized));
}

export function SqlWorkspace() {
  const { activeDatabase, executeSql, history, listHistory } = useMysqlConnectionsStore();
  const [sql, setSql] = useState("SELECT 1;");
  const [result, setResult] = useState<MysqlSqlResult | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const run = async () => {
    const action = async () => { const data = await executeSql(sql, activeDatabase ?? undefined); setResult(data); void listHistory(); message.success(data.message); };
    if (isDangerous(sql)) Modal.confirm({ title: "Run dangerous SQL?", content: "This statement can modify or destroy data.", onOk: action }); else await action();
  };
  return <Card title="SQL Workspace" extra={<Space><Button onClick={async () => { await listHistory(); setHistoryOpen(true); }}>History</Button><Button type="primary" onClick={run}>Run</Button></Space>} style={{ height: "100%", overflow: "auto" }}>
    <Input.TextArea value={sql} onChange={(event) => setSql(event.target.value)} rows={8} style={{ fontFamily: "monospace" }} />
    {result ? <Tabs style={{ marginTop: 12 }} items={[{ key: "table", label: "Table", children: result.rows.length ? <Table rowKey={(_, i) => String(i)} dataSource={result.rows} columns={result.columns.map((column) => ({ title: column, dataIndex: column, ellipsis: true, render: (value: unknown) => String(value ?? "NULL") }))} scroll={{ x: true }} /> : <Typography.Text>Affected rows: {result.affectedRows}{result.lastInsertId ? `, last insert id: ${result.lastInsertId}` : ""}</Typography.Text> }, { key: "json", label: "JSON", children: <pre>{JSON.stringify(result, null, 2)}</pre> }]} /> : null}
    <Drawer title="SQL History" open={historyOpen} onClose={() => setHistoryOpen(false)} width={520}><List dataSource={history} renderItem={(item) => <List.Item onClick={() => { setSql(item.sql); setHistoryOpen(false); }} style={{ cursor: "pointer" }}><Space direction="vertical"><Typography.Text code>{item.database ?? "default"}</Typography.Text><Typography.Text>{item.sql}</Typography.Text><Typography.Text type="secondary">{item.executedAt}</Typography.Text></Space></List.Item>} /></Drawer>
  </Card>;
}

