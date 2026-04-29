import { Card, Col, Row, Space, Statistic, Table, Typography } from "antd";
import { useEffect } from "react";
import * as echarts from "echarts";

import { useServerInfoStore } from "@/plugins/redis-manager/store/server-info";
import { useWorkspaceStore } from "@/plugins/redis-manager/store/workspace";

function useSimpleChart(id: string, data: number[]) {
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const chart = echarts.init(el);
    chart.setOption({
      xAxis: { type: "category", data: data.map((_, idx) => idx + 1) },
      yAxis: { type: "value" },
      series: [{ data, type: "line", smooth: true }],
      grid: { left: 24, right: 12, top: 12, bottom: 24 },
    });
    return () => chart.dispose();
  }, [id, data]);
}

function useDbBarChart(id: string, dbSize: Record<string, number>) {
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const chart = echarts.init(el);
    const entries = Object.entries(dbSize).sort((a, b) => Number(a[0]) - Number(b[0]));
    chart.setOption({
      xAxis: { type: "category", data: entries.map(([db]) => `DB${db}`) },
      yAxis: { type: "value" },
      series: [{ data: entries.map(([, count]) => count), type: "bar" }],
      grid: { left: 24, right: 12, top: 12, bottom: 24 },
    });
    return () => chart.dispose();
  }, [id, dbSize]);
}

export function ServerInfo() {
  const connId = useWorkspaceStore((state) => state.activeConnectionId);
  const info = useServerInfoStore((state) => state.info);
  const slowlogs = useServerInfoStore((state) => state.slowlogs);
  const dbSize = useServerInfoStore((state) => state.dbSize);
  const memorySeries = useServerInfoStore((state) => state.memorySeries);
  const opsSeries = useServerInfoStore((state) => state.opsSeries);
  const loading = useServerInfoStore((state) => state.loading);
  const refresh = useServerInfoStore((state) => state.refresh);

  useEffect(() => {
    if (!connId) return;
    void refresh(connId);
    const timer = setInterval(() => {
      void refresh(connId);
    }, 5000);
    return () => clearInterval(timer);
  }, [connId, refresh]);

  useSimpleChart(
    "rdmm-memory-chart",
    memorySeries,
  );
  useSimpleChart(
    "rdmm-ops-chart",
    opsSeries,
  );
  useDbBarChart("rdmm-db-bar-chart", dbSize);

  if (!connId) {
    return (
      <Card title="Server Info">
        <Typography.Text type="secondary">Connect first to view server info.</Typography.Text>
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Row gutter={12}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="Used Memory" value={info?.memory?.used_memory ?? "-"} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="Connected Clients" value={info?.clients?.connected_clients ?? "-"} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="Ops/Sec"
              value={info?.stats?.instantaneous_ops_per_sec ?? "-"}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="Role" value={info?.replication?.role ?? "-"} />
          </Card>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Card title="Memory Trend">
            <div id="rdmm-memory-chart" style={{ height: 240 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Ops Trend">
            <div id="rdmm-ops-chart" style={{ height: 240 }} />
          </Card>
        </Col>
      </Row>
      <Card title="DB Size">
        <div id="rdmm-db-bar-chart" style={{ height: 220, marginBottom: 12 }} />
        <Table
          size="small"
          pagination={false}
          dataSource={Object.entries(dbSize).map(([db, count]) => ({
            key: db,
            db,
            count,
          }))}
          columns={[
            { title: "DB", dataIndex: "db", key: "db" },
            { title: "Keys", dataIndex: "count", key: "count" },
          ]}
        />
      </Card>
      <Card title="Server Details">
        <Table
          size="small"
          pagination={false}
          dataSource={Object.entries(info?.server ?? {}).map(([k, v]) => ({
            key: k,
            name: k,
            value: v,
          }))}
          columns={[
            { title: "Key", dataIndex: "name", key: "name" },
            { title: "Value", dataIndex: "value", key: "value" },
          ]}
        />
      </Card>
      <Card title="Slowlog">
        <Table
          size="small"
          rowKey="id"
          dataSource={slowlogs}
          columns={[
            { title: "ID", dataIndex: "id", key: "id" },
            { title: "Duration(us)", dataIndex: "durationMicros", key: "durationMicros" },
            { title: "Command", dataIndex: "command", key: "command" },
            { title: "Timestamp", dataIndex: "timestamp", key: "timestamp" },
          ]}
        />
      </Card>
    </Space>
  );
}
