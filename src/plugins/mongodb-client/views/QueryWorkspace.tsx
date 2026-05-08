import { App, Button, Card, Empty, Input, List, Radio, Space, Typography } from "antd";
import { HistoryOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";

import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";

type QueryType = "aggregate" | "command";

export function QueryWorkspace() {
  const { message, modal } = App.useApp();
  const activeConnId = useMongoConnectionsStore((state) => state.activeConnId);
  const activeDatabase = useMongoConnectionsStore((state) => state.activeDatabase);
  const activeCollection = useMongoConnectionsStore((state) => state.activeCollection);
  const history = useMongoConnectionsStore((state) => state.history);
  const runAggregate = useMongoConnectionsStore((state) => state.runAggregate);
  const runCommand = useMongoConnectionsStore((state) => state.runCommand);
  const listHistory = useMongoConnectionsStore((state) => state.listHistory);
  const [queryType, setQueryType] = useState<QueryType>("aggregate");
  const [database, setDatabase] = useState(activeDatabase ?? "admin");
  const [content, setContent] = useState("[\n  { \"$limit\": 10 }\n]");
  const [result, setResult] = useState<string[]>([]);

  useEffect(() => {
    if (activeConnId) void listHistory();
  }, [activeConnId, listHistory]);

  if (!activeConnId) {
    return <Empty description="Connect to MongoDB first." />;
  }

  const isDangerousCommand = () => {
    if (queryType !== "command") return false;
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return ["drop", "dropDatabase", "shutdown", "createUser", "dropUser"].some((key) => key in parsed);
    } catch {
      return false;
    }
  };

  const executeUnsafe = async () => {
    if (queryType === "aggregate") {
      if (!activeDatabase || !activeCollection) {
        message.warning("Select a collection before running aggregate.");
        return;
      }
      setResult(await runAggregate(content));
    } else {
      setResult([await runCommand(database, content)]);
    }
    await listHistory();
  };

  const execute = async () => {
    if (!isDangerousCommand()) {
      await executeUnsafe();
      return;
    }
    modal.confirm({
      title: "Run dangerous MongoDB command?",
      content: "This command can drop data, shut down a server, or change users. Confirm before execution.",
      okButtonProps: { danger: true },
      onOk: executeUnsafe,
    });
  };

  return (
    <Card
      title="MongoDB Query"
      style={{ height: "100%", overflow: "auto", minWidth: 980 }}
      extra={
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void execute()}>
          Run
        </Button>
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Radio.Group
          value={queryType}
          onChange={(event) => setQueryType(event.target.value)}
          options={[
            { label: "Aggregate", value: "aggregate" },
            { label: "Command", value: "command" },
          ]}
        />
        {queryType === "command" ? (
          <Input value={database} onChange={(event) => setDatabase(event.target.value)} placeholder="Database" />
        ) : (
          <Typography.Text type="secondary">
            Aggregate target: {activeDatabase}.{activeCollection}
          </Typography.Text>
        )}
        <Input.TextArea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          style={{ minHeight: 220, fontFamily: "Consolas, monospace" }}
        />
        <Card size="small" title="Result">
          {result.length ? (
            result.map((item, index) => (
              <pre key={index} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {item}
              </pre>
            ))
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
        <Card size="small" title={<Space><HistoryOutlined />History</Space>}>
          <List
            size="small"
            dataSource={history}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setContent(item.content);
                  setQueryType(item.queryType === "command" ? "command" : "aggregate");
                  if (item.database) setDatabase(item.database);
                }}
              >
                <List.Item.Meta
                  title={`${item.queryType} / ${item.database ?? "-"}${item.collection ? `.${item.collection}` : ""}`}
                  description={item.executedAt}
                />
              </List.Item>
            )}
          />
        </Card>
      </Space>
    </Card>
  );
}
