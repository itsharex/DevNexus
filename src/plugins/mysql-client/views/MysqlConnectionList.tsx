import { Button, Card, Empty, Input, message, Popconfirm, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import { MysqlConnectionForm } from "@/plugins/mysql-client/components/MysqlConnectionForm";
import { useMysqlConnectionsStore } from "@/plugins/mysql-client/store/mysql-connections";
import type { MysqlConnectionInfo } from "@/plugins/mysql-client/types";

export function MysqlConnectionList() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MysqlConnectionInfo | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { connections, connectedIds, fetchConnections, connect, disconnect, deleteConnection } = useMysqlConnectionsStore();
  useEffect(() => { void fetchConnections(); }, [fetchConnections]);
  const groups = useMemo(() => {
    const filtered = connections.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) || item.host.toLowerCase().includes(search.toLowerCase()));
    return filtered.reduce<Record<string, MysqlConnectionInfo[]>>((acc, item) => { const key = item.groupName || "Default"; acc[key] = [...(acc[key] ?? []), item]; return acc; }, {});
  }, [connections, search]);
  return <Card title="MySQL Connections" extra={<Space><Input.Search placeholder="Search by name or host" onChange={(event) => setSearch(event.target.value)} /><Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>+ New</Button></Space>} style={{ height: "100%", overflow: "auto" }}>
    {Object.keys(groups).length === 0 ? <Empty /> : Object.entries(groups).map(([group, items]) => <div key={group} style={{ marginBottom: 18 }}><Typography.Title level={5}>{group}</Typography.Title><Space wrap>{items.map((conn) => {
      const connected = connectedIds.includes(conn.id);
      return <Card key={conn.id} hoverable onDoubleClick={async () => { await connect(conn.id); message.success(`Connected to ${conn.name}`); }} style={{ width: 330 }} size="small">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space style={{ justifyContent: "space-between", width: "100%" }}><Typography.Text strong>{conn.name}</Typography.Text><Tag color={connected ? "green" : "default"}>{connected ? "Connected" : "Disconnected"}</Tag></Space>
          <Typography.Text type="secondary">{conn.username}@{conn.host}:{conn.port}</Typography.Text>
          <Space wrap><Tag>{conn.defaultDatabase || "no default db"}</Tag><Tag>{conn.charset || "utf8mb4"}</Tag><Tag>{conn.sslMode || "preferred"}</Tag></Space>
          <Space><Button size="small" type="primary" onClick={() => connect(conn.id)}>Connect</Button><Button size="small" onClick={() => disconnect(conn.id)} disabled={!connected}>Disconnect</Button><Button size="small" onClick={() => { setEditing(conn); setFormOpen(true); }}>Edit</Button><Popconfirm title="Delete MySQL connection?" onConfirm={() => deleteConnection(conn.id)}><Button danger size="small">Delete</Button></Popconfirm></Space>
        </Space>
      </Card>;
    })}</Space></div>)}
    <MysqlConnectionForm open={formOpen} initial={editing} onClose={() => setFormOpen(false)} />
  </Card>;
}
