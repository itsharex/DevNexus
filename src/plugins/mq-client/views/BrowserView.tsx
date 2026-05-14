import { Button, Card, Empty, Tree, Typography } from "antd";
import type { DataNode } from "antd/es/tree";

import { useMqStore } from "@/plugins/mq-client/store/mq-client";
import type { MqResourceNode } from "@/plugins/mq-client/types";

function toTree(node: MqResourceNode): DataNode {
  return { key: node.key, title: <span>{node.title} <Typography.Text type="secondary">{node.nodeType}</Typography.Text></span>, children: node.children.map(toTree) };
}

export function BrowserView() {
  const activeConnId = useMqStore((state) => state.activeConnId);
  const resources = useMqStore((state) => state.resources);
  const browse = useMqStore((state) => state.browse);

  if (!activeConnId) return <Empty description="Connect to RabbitMQ or Kafka first" />;

  return <Card title="MQ Browser" extra={<Button onClick={() => browse()}>Refresh</Button>}>
    <Typography.Paragraph type="secondary">RabbitMQ browsing requires Management Plugin. Kafka browsing is read-only and does not modify topics or offsets.</Typography.Paragraph>
    <Tree showLine defaultExpandAll treeData={resources.map(toTree)} />
  </Card>;
}
