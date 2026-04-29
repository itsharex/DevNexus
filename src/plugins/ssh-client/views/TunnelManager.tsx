import { App, Button, Card, Space, Table, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";

import { useSshWorkspaceStore } from "@/plugins/ssh-client/store/workspace";
import { useSshConnectionsStore } from "@/plugins/ssh-client/store/ssh-connections";
import { useSshTunnelsStore } from "@/plugins/ssh-client/store/tunnels";
import { TunnelRuleForm } from "@/plugins/ssh-client/components/TunnelRuleForm";
import type { TunnelRuleForm as TunnelRuleFormData } from "@/plugins/ssh-client/types";

export function TunnelManager() {
  const { message } = App.useApp();
  const [openForm, setOpenForm] = useState(false);
  const activeConnectionId = useSshWorkspaceStore((state) => state.activeConnectionId);
  const connections = useSshConnectionsStore((state) => state.connections);
  const fetchConnections = useSshConnectionsStore((state) => state.fetchConnections);

  const rules = useSshTunnelsStore((state) => state.rules);
  const loading = useSshTunnelsStore((state) => state.loading);
  const fetchRules = useSshTunnelsStore((state) => state.fetchRules);
  const saveRule = useSshTunnelsStore((state) => state.saveRule);
  const deleteRule = useSshTunnelsStore((state) => state.deleteRule);
  const startRule = useSshTunnelsStore((state) => state.startRule);
  const stopRule = useSshTunnelsStore((state) => state.stopRule);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const connId = useMemo(
    () => activeConnectionId ?? connections[0]?.id ?? null,
    [activeConnectionId, connections],
  );

  useEffect(() => {
    if (!connId) {
      return;
    }
    void fetchRules(connId);
  }, [connId, fetchRules]);

  if (!connId) {
    return <Card title="Tunnel Manager">Create SSH connection first.</Card>;
  }

  return (
    <Card
      title="Tunnel Manager"
      extra={
        <Button type="primary" onClick={() => setOpenForm(true)}>
          New Rule
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rules}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: "Name", dataIndex: "name" },
          { title: "Type", dataIndex: "tunnelType", width: 120 },
          {
            title: "Mapping",
            render: (_, item) =>
              `${item.localHost ?? ""}:${item.localPort ?? ""} -> ${item.remoteHost ?? ""}:${item.remotePort ?? ""}`,
          },
          {
            title: "Status",
            width: 120,
            render: (_, item) => (
              <Tag color={item.status === "running" ? "green" : item.status === "error" ? "red" : "default"}>
                {item.status}
              </Tag>
            ),
          },
          {
            title: "Actions",
            width: 260,
            render: (_, item) => (
              <Space>
                {item.status === "running" ? (
                  <Button size="small" onClick={() => void stopRule(item.id, connId)}>
                    Stop
                  </Button>
                ) : (
                  <Button size="small" type="primary" onClick={() => void startRule(item)}>
                    Start
                  </Button>
                )}
                <Button
                  size="small"
                  danger
                  onClick={() =>
                    void deleteRule(item.id, connId).then(() => message.success("Rule deleted."))
                  }
                >
                  Delete
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <TunnelRuleForm
        open={openForm}
        connections={connections}
        onCancel={() => setOpenForm(false)}
        onSubmit={(values: TunnelRuleFormData) => {
          void saveRule(values).then(() => {
            message.success("Tunnel rule saved.");
            setOpenForm(false);
          });
        }}
      />
    </Card>
  );
}
