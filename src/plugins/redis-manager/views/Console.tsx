import { App, AutoComplete, Button, Card, Drawer, List, Modal, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

import { useConsoleStore } from "@/plugins/redis-manager/store/console";
import { useConnectionsStore } from "@/plugins/redis-manager/store/connections";
import { useWorkspaceStore } from "@/plugins/redis-manager/store/workspace";
import type { RedisValue } from "@/plugins/redis-manager/types";

function renderRedisValue(value: RedisValue, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (value.kind === "nil") return "(nil)";
  if (value.kind === "int") return String(value.value);
  if (value.kind === "bulk") return value.value;
  if (value.kind === "error") return `ERR ${value.value}`;
  if (value.value.length === 0) return "(empty array)";
  return value.value
    .map((item, index) => `${indent}${index + 1}) ${renderRedisValue(item, depth + 1)}`)
    .join("\n");
}

function renderTerminalValue(value: RedisValue): string {
  const text = renderRedisValue(value);
  return value.kind === "error" ? `\x1b[31m${text}\x1b[0m` : text;
}

export function ConsoleView() {
  const { message } = App.useApp();
  const connId = useWorkspaceStore((state) => state.activeConnectionId);
  const dbIndex = useWorkspaceStore((state) => state.activeDbIndex);
  const setActiveConnectionId = useWorkspaceStore((state) => state.setActiveConnectionId);
  const setActiveDbIndex = useWorkspaceStore((state) => state.setActiveDbIndex);
  const connections = useConnectionsStore((state) => state.connections);
  const connectedIds = useConnectionsStore((state) => state.connectedIds);
  const selectDb = useConnectionsStore((state) => state.selectDb);
  const fetchConnections = useConnectionsStore((state) => state.fetchConnections);
  const input = useConsoleStore((state) => state.input);
  const setInput = useConsoleStore((state) => state.setInput);
  const execute = useConsoleStore((state) => state.execute);
  const loadHistory = useConsoleStore((state) => state.loadHistory);
  const moveHistory = useConsoleStore((state) => state.moveHistory);
  const history = useConsoleStore((state) => state.history);
  const logs = useConsoleStore((state) => state.logs);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const termContainerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);

  const connectionOptions = useMemo(
    () =>
      connections
        .filter((item) => connectedIds.includes(item.id) || item.id === connId)
        .map((item) => ({
          label: `${item.name} (${item.host}:${item.port})`,
          value: item.id,
        })),
    [connId, connectedIds, connections],
  );

  const commandHints = useMemo(
    () => [
      "GET",
      "SET",
      "DEL",
      "EXPIRE",
      "TTL",
      "EXISTS",
      "HGETALL",
      "HSET",
      "HDEL",
      "LRANGE",
      "LLEN",
      "LPUSH",
      "RPUSH",
      "LREM",
      "SMEMBERS",
      "SADD",
      "SREM",
      "ZRANGE",
      "ZRANGEBYSCORE",
      "ZADD",
      "ZREM",
      "ZSCORE",
      "INFO",
      "SLOWLOG GET",
      "DBSIZE",
      "SCAN",
    ],
    [],
  );

  useEffect(() => {
    if (!connId) {
      return;
    }
    void fetchConnections();
    void loadHistory(connId);
  }, [connId, fetchConnections, loadHistory]);

  useEffect(() => {
    if (!termContainerRef.current) {
      return;
    }
    const terminal = new Terminal({
      rows: 16,
      fontSize: 12,
      convertEol: true,
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
      },
    });
    terminal.open(termContainerRef.current);
    terminal.writeln("DevNexus Redis Console Ready.");
    termRef.current = terminal;
    return () => {
      terminal.dispose();
      termRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!termRef.current || logs.length === 0) {
      return;
    }
    const last = logs[logs.length - 1];
    termRef.current.writeln(`> ${last.command}`);
    termRef.current.writeln(renderTerminalValue(last.result));
  }, [logs]);

  const runCommand = (value: string, confirmDangerous = false) => {
    if (!connId) {
      return;
    }
    if (!value.trim()) {
      return;
    }
    void execute(connId, value, confirmDangerous).catch((err: unknown) => {
      const text = String(err);
      if (text.includes("requires confirmation")) {
        Modal.confirm({
          title: "Dangerous command",
          content: "This command may modify critical data. Confirm execution?",
          okText: "Confirm Execute",
          onOk: () => {
            runCommand(value, true);
          },
        });
        return;
      }
      message.error(text);
    });
  };

  if (!connId) {
    return (
      <Card title="Console">
        <Typography.Text type="secondary">Connect first to use console.</Typography.Text>
      </Card>
    );
  }

  return (
    <Card
      title="Console"
      extra={
        <Space>
          <Select
            size="small"
            style={{ width: 260 }}
            value={connId}
            options={connectionOptions}
            onChange={(nextConnId) => {
              setActiveConnectionId(nextConnId);
              const next = connections.find((item) => item.id === nextConnId);
              setActiveDbIndex(next?.dbIndex ?? 0);
              void loadHistory(nextConnId);
            }}
          />
          <Select
            size="small"
            style={{ width: 92 }}
            value={dbIndex}
            options={Array.from({ length: 16 }, (_, idx) => ({
              label: `DB ${idx}`,
              value: idx,
            }))}
            onChange={(nextDbIndex) => {
              void selectDb(connId, nextDbIndex)
                .then(async () => {
                  setActiveDbIndex(nextDbIndex);
                  await fetchConnections();
                  message.success(`Switched to DB ${nextDbIndex}`);
                })
                .catch((err: unknown) => message.error(String(err)));
            }}
          />
          <Button onClick={() => setDrawerOpen(true)}>History</Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <AutoComplete
          value={input}
          style={{ width: "100%" }}
          options={commandHints
            .filter((item) => item.startsWith(input.toUpperCase()))
            .slice(0, 10)
            .map((item) => ({ value: item }))}
          onChange={(value) => setInput(value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runCommand(input);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveHistory("up");
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveHistory("down");
            }
          }}
        />
        <Button type="primary" onClick={() => runCommand(input)}>
          Execute
        </Button>
        <div
          ref={termContainerRef}
          style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #1e293b" }}
        />
        <List
          bordered
          dataSource={logs}
          renderItem={(item) => (
            <List.Item>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Typography.Text code>{item.command}</Typography.Text>
                <Typography.Text type={item.result.kind === "error" ? "danger" : undefined}>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                    {renderRedisValue(item.result)}
                  </pre>
                </Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Space>
      <Drawer
        title="Command History"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        <List
          dataSource={history}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="run"
                  size="small"
                  onClick={() => {
                    setInput(item);
                    runCommand(item);
                  }}
                >
                  Run
                </Button>,
              ]}
            >
              <Typography.Text code>{item}</Typography.Text>
            </List.Item>
          )}
        />
      </Drawer>
    </Card>
  );
}
