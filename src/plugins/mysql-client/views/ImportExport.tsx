import { Button, Card, Form, Input, List, message, Select, Space, Typography } from "antd";
import { useState } from "react";
import { useMysqlConnectionsStore } from "@/plugins/mysql-client/store/mysql-connections";

export function ImportExport() {
  const { activeTable, exportRows, pickImportFile, previewImportFile, importRows } = useMysqlConnectionsStore();
  const [filePath, setFilePath] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [mode, setMode] = useState("insertOnly");
  return <Card title="Import / Export" style={{ height: "100%", overflow: "auto" }}>
    <Space direction="vertical" style={{ width: "100%" }}>
      <Typography.Text type="secondary">Current table: {activeTable ?? "-"}</Typography.Text>
      <Space><Button disabled={!activeTable} onClick={async () => message.success(`Exported: ${await exportRows("json")}`)}>Export JSON</Button><Button disabled={!activeTable} onClick={async () => message.success(`Exported: ${await exportRows("csv")}`)}>Export CSV</Button></Space>
      <Form layout="vertical"><Form.Item label="Import file path"><Input value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="Put .json/.csv into app data imports folder or enter full path" /></Form.Item><Space><Button onClick={async () => { const path = await pickImportFile(); if (path) setFilePath(path); }}>Pick from imports</Button><Button disabled={!filePath} onClick={async () => setPreview(await previewImportFile(filePath))}>Preview</Button><Select value={mode} onChange={setMode} options={[{ value: "insertOnly", label: "Insert Only" }, { value: "replaceInto", label: "Replace Into" }]} /><Button type="primary" disabled={!filePath || !activeTable} onClick={async () => { const result = await importRows(filePath, mode); message.success(`Imported ${result.successCount}, failed ${result.failedCount}`); }}>Import</Button></Space></Form>
      <List header="Preview" dataSource={preview} renderItem={(item) => <List.Item><pre>{JSON.stringify(item, null, 2)}</pre></List.Item>} />
    </Space>
  </Card>;
}
