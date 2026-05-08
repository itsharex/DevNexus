import { Card, Empty, Row, Col, Space, Statistic, Table, Typography } from "antd";
import { useEffect } from "react";

import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";

function rows(data: Record<string, string>) {
  return Object.entries(data).map(([name, value]) => ({ key: name, name, value }));
}

export function ServerStatus() {
  const activeConnId = useMongoConnectionsStore((state) => state.activeConnId);
  const serverStatus = useMongoConnectionsStore((state) => state.serverStatus);
  const loadServerStatus = useMongoConnectionsStore((state) => state.loadServerStatus);

  useEffect(() => {
    if (!activeConnId) return;
    void loadServerStatus();
    const timer = setInterval(() => {
      void loadServerStatus();
    }, 5000);
    return () => clearInterval(timer);
  }, [activeConnId, loadServerStatus]);

  if (!activeConnId) {
    return <Empty description="Connect to MongoDB first." />;
  }

  return (
    <div style={{ height: "100%", overflow: "auto", minWidth: 920, paddingRight: 4 }}>
      <Space direction="vertical" size={12} style={{ width: "100%", paddingBottom: 16 }}>
        <Row gutter={12}>
          <Col span={8}>
            <Card>
              <Statistic title="MongoDB Version" value={serverStatus?.version ?? "-"} />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic title="Current Connections" value={serverStatus?.connections?.current ?? "-"} />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic title="Memory Resident" value={serverStatus?.memory?.resident ?? "-"} />
            </Card>
          </Col>
        </Row>
        <Card title="Opcounters">
          <Table
            size="small"
            pagination={false}
            dataSource={rows(serverStatus?.opcounters ?? {})}
            columns={[
              { title: "Name", dataIndex: "name" },
              { title: "Value", dataIndex: "value" },
            ]}
          />
        </Card>
        <Card title="Connections">
          <Table
            size="small"
            pagination={false}
            dataSource={rows(serverStatus?.connections ?? {})}
            columns={[
              { title: "Name", dataIndex: "name" },
              { title: "Value", dataIndex: "value" },
            ]}
          />
        </Card>
        <Card title="Memory">
          <Typography.Text type="secondary">Values are reported by MongoDB serverStatus.mem.</Typography.Text>
          <Table
            size="small"
            pagination={false}
            dataSource={rows(serverStatus?.memory ?? {})}
            columns={[
              { title: "Name", dataIndex: "name" },
              { title: "Value", dataIndex: "value" },
            ]}
          />
        </Card>
      </Space>
    </div>
  );
}
