import { Card, Empty, Statistic, Table } from "antd";
import { useEffect } from "react";
import { useMysqlConnectionsStore } from "@/plugins/mysql-client/store/mysql-connections";

export function ServerStatus() {
  const { activeConnId, serverStatus, loadServerStatus } = useMysqlConnectionsStore();
  useEffect(() => { if (activeConnId) void loadServerStatus(); }, [activeConnId, loadServerStatus]);
  if (!activeConnId) return <Empty description="Connect to MySQL first." />;
  const rows = Object.entries(serverStatus?.status ?? {}).map(([name, value]) => ({ name, value }));
  return <Card title="MySQL Server" style={{ height: "100%", overflow: "auto" }}>
    <Statistic title="Version" value={serverStatus?.version ?? "-"} />
    <Table rowKey="name" dataSource={rows} pagination={false} columns={[{ title: "Variable", dataIndex: "name" }, { title: "Value", dataIndex: "value" }]} />
  </Card>;
}
