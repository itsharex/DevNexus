import { Button, Card, Empty, List, Space, Statistic, Table, Typography } from "antd";
import { useMysqlConnectionsStore } from "@/plugins/mysql-client/store/mysql-connections";

export function DatabaseBrowser() {
  const { activeConnId, activeDatabase, databases, tables, tableStatus, columns, listDatabases, listTables, selectTable } = useMysqlConnectionsStore();
  if (!activeConnId) return <Empty description="Connect to MySQL first." />;
  return <div style={{ height: "100%", display: "grid", gridTemplateColumns: "260px 320px 1fr", gap: 12, minHeight: 0 }}>
    <Card title="Databases" extra={<Button size="small" onClick={() => listDatabases()}>Refresh</Button>} style={{ overflow: "auto" }}><List dataSource={databases} renderItem={(db) => <List.Item onClick={() => listTables(db.name)} style={{ cursor: "pointer", background: activeDatabase === db.name ? "#e6f4ff" : undefined, paddingInline: 8 }}>{db.name}</List.Item>} /></Card>
    <Card title="Tables" style={{ overflow: "auto" }}>{tables.length ? <List dataSource={tables} renderItem={(table) => <List.Item onClick={() => activeDatabase && selectTable(activeDatabase, table.name)} style={{ cursor: "pointer", paddingInline: 8 }}><Space direction="vertical" size={0}><Typography.Text>{table.name}</Typography.Text><Typography.Text type="secondary">{table.tableType}</Typography.Text></Space></List.Item>} /> : <Empty description="Select database" />}</Card>
    <Card title="Table Summary" style={{ overflow: "auto" }}>{tableStatus ? <Space direction="vertical" style={{ width: "100%" }}><Space wrap><Statistic title="Rows" value={tableStatus.rows ?? 0} /><Statistic title="Data" value={tableStatus.dataLength ?? 0} /><Statistic title="Index" value={tableStatus.indexLength ?? 0} /></Space><Typography.Text>Engine: {tableStatus.engine ?? "-"}</Typography.Text><Typography.Text>Collation: {tableStatus.collation ?? "-"}</Typography.Text><Table size="small" rowKey="name" dataSource={columns} pagination={false} columns={[{ title: "Column", dataIndex: "name" }, { title: "Type", dataIndex: "columnType" }, { title: "Null", dataIndex: "nullable", render: (v) => v ? "YES" : "NO" }, { title: "Key", dataIndex: "key" }, { title: "Extra", dataIndex: "extra" }]} /></Space> : <Empty description="Select table" />}</Card>
  </div>;
}
