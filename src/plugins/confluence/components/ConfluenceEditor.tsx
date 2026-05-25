import { Button, Space, Tooltip, Typography } from "antd";
import { useCallback, useMemo, useState } from "react";
import { CloudUploadOutlined, FolderOpenOutlined, SaveOutlined, SettingOutlined } from "@ant-design/icons";
import Editor from "@monaco-editor/react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

import { useConfluenceStore } from "@/plugins/confluence/store/confluence";
import { markdownToPreviewHtml } from "@/plugins/confluence/utils/converter";
import { ConnectionSettings } from "@/plugins/confluence/components/ConnectionSettings";
import { PublishDialog } from "@/plugins/confluence/components/PublishDialog";

export function ConfluenceEditor() {
  const markdownContent = useConfluenceStore((s) => s.markdownContent);
  const setMarkdownContent = useConfluenceStore((s) => s.setMarkdownContent);
  const currentFilePath = useConfluenceStore((s) => s.currentFilePath);
  const setCurrentFilePath = useConfluenceStore((s) => s.setCurrentFilePath);
  const activeConnectionId = useConfluenceStore((s) => s.activeConnectionId);
  const fileMappings = useConfluenceStore((s) => s.fileMappings);

  const [showSettings, setShowSettings] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const previewHtml = useMemo(() => {
    try {
      return markdownToPreviewHtml(markdownContent);
    } catch {
      return "<p style='color:red'>Conversion error</p>";
    }
  }, [markdownContent]);

  const currentMapping = currentFilePath ? fileMappings.find((m) => m.filePath === currentFilePath) : null;

  const handleOpenFile = useCallback(async () => {
    const selected = await openDialog({
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      multiple: false,
    });
    if (selected) {
      const content = await readTextFile(selected);
      setMarkdownContent(content);
      setCurrentFilePath(selected);
    }
  }, [setMarkdownContent, setCurrentFilePath]);

  const handleSaveFile = useCallback(async () => {
    if (currentFilePath) {
      await writeTextFile(currentFilePath, markdownContent);
    } else {
      const path = await saveDialog({
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (path) {
        await writeTextFile(path, markdownContent);
        setCurrentFilePath(path);
      }
    }
  }, [currentFilePath, markdownContent, setCurrentFilePath]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--ant-color-border, #d9d9d9)" }}>
        <Space>
          <Tooltip title="Open .md file">
            <Button icon={<FolderOpenOutlined />} size="small" onClick={handleOpenFile}>Open</Button>
          </Tooltip>
          <Tooltip title="Save file">
            <Button icon={<SaveOutlined />} size="small" onClick={handleSaveFile}>Save</Button>
          </Tooltip>
          <Tooltip title="Connection settings">
            <Button icon={<SettingOutlined />} size="small" onClick={() => setShowSettings(true)}>
              {activeConnectionId ? "Connected" : "Connect"}
            </Button>
          </Tooltip>
        </Space>
        <Space>
          {currentFilePath && (
            <Typography.Text type="secondary" style={{ fontSize: 12, maxWidth: 300 }} ellipsis>
              {currentFilePath}
            </Typography.Text>
          )}
          {currentMapping && (
            <Typography.Text type="success" style={{ fontSize: 12 }}>
              → {currentMapping.pageTitle} (v{currentMapping.version})
            </Typography.Text>
          )}
          <Tooltip title={currentMapping ? "Update page" : "Publish to Confluence"}>
            <Button type="primary" icon={<CloudUploadOutlined />} size="small" onClick={() => setShowPublish(true)}>
              {currentMapping ? "Update" : "Publish"}
            </Button>
          </Tooltip>
        </Space>
      </div>

      {/* Editor + Preview split */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* Monaco Editor */}
        <div style={{ flex: 1, minWidth: 0, borderRight: "1px solid var(--ant-color-border, #d9d9d9)" }}>
          <Editor
            height="100%"
            language="markdown"
            value={markdownContent}
            onChange={(value) => setMarkdownContent(value || "")}
            options={{
              minimap: { enabled: false },
              wordWrap: "on",
              fontSize: 14,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
            }}
          />
        </div>

        {/* Confluence Preview */}
        <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "16px 24px", fontFamily: "Arial, sans-serif", fontSize: 14, lineHeight: 1.6 }}>
          <div
            dangerouslySetInnerHTML={{ __html: previewHtml }}
            style={{ maxWidth: "100%" }}
          />
        </div>
      </div>

      <ConnectionSettings open={showSettings} onClose={() => setShowSettings(false)} />
      <PublishDialog open={showPublish} onClose={() => setShowPublish(false)} />
    </div>
  );
}
