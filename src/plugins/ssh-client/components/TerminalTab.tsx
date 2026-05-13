import { useEffect, useRef, useState } from "react";
import { Button, Card, Space, Tag, Typography } from "antd";
import { FullscreenExitOutlined, FullscreenOutlined } from "@ant-design/icons";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "xterm/css/xterm.css";

import { useSshSessionsStore } from "@/plugins/ssh-client/store/sessions";
import { QuickCommandPanel } from "@/plugins/ssh-client/components/QuickCommandPanel";
import {
  getCommandSuggestions,
  updateCommandDraft,
} from "@/plugins/ssh-client/utils/command-suggestions";

interface TerminalTabProps {
  sessionId: string;
  connId: string;
  status: "connecting" | "active" | "closed";
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function TerminalTab({
  sessionId,
  connId,
  status,
  fullscreen = false,
  onToggleFullscreen,
}: TerminalTabProps) {
  const output = useSshSessionsStore((state) => state.outputBySession[sessionId] ?? []);
  const quickCommands = useSshSessionsStore((state) => state.quickCommands);
  const loadQuickCommands = useSshSessionsStore((state) => state.loadQuickCommands);
  const sendInput = useSshSessionsStore((state) => state.sendInput);
  const resizeSession = useSshSessionsStore((state) => state.resizeSession);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const renderedChunksRef = useRef(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandDraft, setCommandDraft] = useState("");
  const suggestions = getCommandSuggestions(commandDraft, quickCommands, 5);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) {
      return;
    }
    const terminal = new Terminal({
      fontSize: 13,
      convertEol: true,
      cursorBlink: true,
      theme: {
        background: "#0b1220",
        foreground: "#dbeafe",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminalRef.current = terminal;
    fitRef.current = fitAddon;
    renderedChunksRef.current = 0;

    void resizeSession(sessionId, terminal.cols, terminal.rows);

    const disposeData = terminal.onData((chunk) => {
      setCommandDraft((current) => updateCommandDraft(current, chunk));
      void sendInput(sessionId, chunk);
    });
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      void resizeSession(sessionId, terminal.cols, terminal.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      disposeData.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId, sendInput, resizeSession]);

  useEffect(() => {
    void loadQuickCommands(connId);
  }, [connId, loadQuickCommands]);

  useEffect(() => {
    window.setTimeout(() => {
      fitRef.current?.fit();
      if (terminalRef.current) {
        void resizeSession(sessionId, terminalRef.current.cols, terminalRef.current.rows);
      }
    }, 0);
  }, [fullscreen, sessionId, resizeSession]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }
    if (output.length < renderedChunksRef.current) {
      terminalRef.current.reset();
      renderedChunksRef.current = 0;
    }
    for (let i = renderedChunksRef.current; i < output.length; i += 1) {
      terminalRef.current.write(output[i]);
    }
    renderedChunksRef.current = output.length;
  }, [output]);

  const applySuggestion = async (command: string) => {
    const prefix = commandDraft.trimStart();
    const nextInput = command.startsWith(prefix) ? command.slice(prefix.length) : command;
    await sendInput(sessionId, nextInput);
    setCommandDraft(command);
  };

  return (
    <Card
      size="small"
      className={fullscreen ? "devnexus-terminal-card devnexus-terminal-card--fullscreen" : "devnexus-terminal-card"}
      style={{ height: "100%" }}
      styles={{
        body: {
          padding: fullscreen ? 12 : 10,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        },
      }}
      extra={
        <Space>
          <Tag color={status === "active" ? "green" : "default"}>{status}</Tag>
          <Button
            size="small"
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={onToggleFullscreen}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          />
          <Button size="small" onClick={() => setDrawerOpen(true)}>
            Quick Commands
          </Button>
        </Space>
      }
    >
      <Typography.Text type="secondary" style={{ marginBottom: 8 }}>
        Connection: {connId}
      </Typography.Text>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid rgba(148,163,184,0.25)",
          background: "#0b1220",
        }}
      />
      <div className="devnexus-terminal-suggestions">
        {suggestions.map((item) => (
          <button
            key={`${item.source}-${item.command}`}
            className="devnexus-terminal-suggestion"
            type="button"
            title={item.command}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void applySuggestion(item.command)}
          >
            <span>{item.label}</span>
            {item.source === "quick" ? <em>quick</em> : null}
          </button>
        ))}
      </div>
      <QuickCommandPanel
        open={drawerOpen}
        activeConnectionId={connId}
        activeSessionId={sessionId}
        onClose={() => setDrawerOpen(false)}
      />
    </Card>
  );
}
