import { App, Button, Card, Empty, Input, Radio, Space, Typography } from "antd";
import { useState } from "react";

import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";

export function ImportExport() {
  const { message } = App.useApp();
  const activeConnId = useMongoConnectionsStore((state) => state.activeConnId);
  const activeDatabase = useMongoConnectionsStore((state) => state.activeDatabase);
  const activeCollection = useMongoConnectionsStore((state) => state.activeCollection);
  const exportDocuments = useMongoConnectionsStore((state) => state.exportDocuments);
  const pickImportFile = useMongoConnectionsStore((state) => state.pickImportFile);
  const previewImportFile = useMongoConnectionsStore((state) => state.previewImportFile);
  const importDocuments = useMongoConnectionsStore((state) => state.importDocuments);
  const [filterJson, setFilterJson] = useState("{}");
  const [format, setFormat] = useState<"json" | "jsonl">("json");
  const [filePath, setFilePath] = useState("");
  const [mode, setMode] = useState("insertOnly");
  const [preview, setPreview] = useState<string[]>([]);

  if (!activeConnId || !activeDatabase || !activeCollection) {
    return <Empty description="Select a collection first." />;
  }

  return (
    <Card title={`Import / Export / ${activeDatabase}.${activeCollection}`} style={{ height: "100%", overflow: "auto", minWidth: 920 }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card size="small" title="Export">
          <Space direction="vertical" style={{ width: "100%" }}>
            <Input.TextArea value={filterJson} onChange={(event) => setFilterJson(event.target.value)} autoSize={{ minRows: 2 }} />
            <Radio.Group
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              options={[
                { label: "JSON Array", value: "json" },
                { label: "JSON Lines", value: "jsonl" },
              ]}
            />
            <Button
              type="primary"
              onClick={async () => {
                const path = await exportDocuments(filterJson, format);
                message.success(`Exported: ${path}`);
              }}
            >
              Export
            </Button>
          </Space>
        </Card>
        <Card size="small" title="Import">
          <Space direction="vertical" style={{ width: "100%" }}>
            <Space.Compact style={{ width: "100%" }}>
              <Input value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="Import file path" />
              <Button
                onClick={async () => {
                  const picked = await pickImportFile();
                  if (picked) setFilePath(picked);
                }}
              >
                Pick
              </Button>
              <Button
                onClick={async () => {
                  setPreview(await previewImportFile(filePath, 20));
                }}
              >
                Preview
              </Button>
            </Space.Compact>
            <Radio.Group
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              options={[
                { label: "Insert Only", value: "insertOnly" },
                { label: "Upsert by _id", value: "upsertById" },
                { label: "Replace by _id", value: "replaceById" },
              ]}
            />
            <Button
              type="primary"
              onClick={async () => {
                const result = await importDocuments(filePath, mode);
                message.success(`Imported ${result.successCount}, failed ${result.failedCount}`);
              }}
            >
              Import
            </Button>
            <Typography.Text type="secondary">Preview</Typography.Text>
            {preview.map((item, index) => (
              <pre key={index} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {item}
              </pre>
            ))}
          </Space>
        </Card>
      </Space>
    </Card>
  );
}
