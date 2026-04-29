import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { HashEditor } from "@/plugins/redis-manager/components/editors/HashEditor";
import { ListEditor } from "@/plugins/redis-manager/components/editors/ListEditor";
import { SetEditor } from "@/plugins/redis-manager/components/editors/SetEditor";
import { StringEditor } from "@/plugins/redis-manager/components/editors/StringEditor";
import { ZSetEditor } from "@/plugins/redis-manager/components/editors/ZSetEditor";
import { KeyTree } from "@/plugins/redis-manager/components/KeyTree";
import { useKeyBrowserStore } from "@/plugins/redis-manager/store/key-browser";
import { useWorkspaceStore } from "@/plugins/redis-manager/store/workspace";
import { useConnectionsStore } from "@/plugins/redis-manager/store/connections";
import type { ExportItem, ImportResult } from "@/plugins/redis-manager/types";

export function KeyBrowser() {
  const { message } = App.useApp();
  const connId = useWorkspaceStore((state) => state.activeConnectionId);
  const activeDbIndex = useWorkspaceStore((state) => state.activeDbIndex);
  const setActiveDbIndex = useWorkspaceStore((state) => state.setActiveDbIndex);
  const selectDb = useConnectionsStore((state) => state.selectDb);
  const fetchConnections = useConnectionsStore((state) => state.fetchConnections);

  const keys = useKeyBrowserStore((state) => state.keys);
  const loading = useKeyBrowserStore((state) => state.loading);
  const selectedKeys = useKeyBrowserStore((state) => state.selectedKeys);
  const selectedKey = useKeyBrowserStore((state) => state.selectedKey);
  const selectedType = useKeyBrowserStore((state) => state.selectedType);
  const selectedTtl = useKeyBrowserStore((state) => state.selectedTtl);
  const stringValue = useKeyBrowserStore((state) => state.stringValue);
  const hashFields = useKeyBrowserStore((state) => state.hashFields);
  const listValues = useKeyBrowserStore((state) => state.listValues);
  const setValues = useKeyBrowserStore((state) => state.setValues);
  const zsetValues = useKeyBrowserStore((state) => state.zsetValues);
  const resetScan = useKeyBrowserStore((state) => state.resetScan);
  const setPattern = useKeyBrowserStore((state) => state.setPattern);
  const toggleSelectedKey = useKeyBrowserStore((state) => state.toggleSelectedKey);
  const clearSelectedKeys = useKeyBrowserStore((state) => state.clearSelectedKeys);
  const scanMore = useKeyBrowserStore((state) => state.scanMore);
  const loadKeyDetail = useKeyBrowserStore((state) => state.loadKeyDetail);
  const updateString = useKeyBrowserStore((state) => state.updateString);
  const updateTTL = useKeyBrowserStore((state) => state.updateTTL);
  const deleteKeys = useKeyBrowserStore((state) => state.deleteKeys);
  const renameKey = useKeyBrowserStore((state) => state.renameKey);
  const setHashField = useKeyBrowserStore((state) => state.setHashField);
  const deleteHashField = useKeyBrowserStore((state) => state.deleteHashField);
  const setListItem = useKeyBrowserStore((state) => state.setListItem);
  const lpush = useKeyBrowserStore((state) => state.lpush);
  const rpush = useKeyBrowserStore((state) => state.rpush);
  const lrem = useKeyBrowserStore((state) => state.lrem);
  const sadd = useKeyBrowserStore((state) => state.sadd);
  const srem = useKeyBrowserStore((state) => state.srem);
  const zadd = useKeyBrowserStore((state) => state.zadd);
  const zrem = useKeyBrowserStore((state) => state.zrem);
  const zrangeByScore = useKeyBrowserStore((state) => state.zrangeByScore);

  const [newName, setNewName] = useState("");
  const [ttlInput, setTtlInput] = useState("");
  const [batchTtl, setBatchTtl] = useState("60");
  const [exportFormat, setExportFormat] = useState<"Json" | "Csv">("Json");
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importPreviewPath, setImportPreviewPath] = useState<string | null>(null);
  const [importPreviewItems, setImportPreviewItems] = useState<ExportItem[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!connId) {
      return;
    }
    resetScan();
    void scanMore(connId);
  }, [connId, activeDbIndex, resetScan, scanMore]);

  const details = useMemo(() => {
    if (!selectedKey || !selectedType) {
      return <Typography.Text type="secondary">Select a key from left list.</Typography.Text>;
    }
    if (selectedType === "string") {
      return (
        <StringEditor
          value={stringValue}
          onSave={(value) => {
            if (!connId) return;
            void updateString(connId, value);
          }}
        />
      );
    }
    if (selectedType === "hash") {
      return (
        <HashEditor
          rows={hashFields}
          onSet={async (field, value) => {
            if (!connId || !selectedKey) return;
            await setHashField(connId, selectedKey, field, value);
          }}
          onDelete={async (field) => {
            if (!connId || !selectedKey) return;
            await deleteHashField(connId, selectedKey, field);
          }}
        />
      );
    }
    if (selectedType === "list") {
      return (
        <ListEditor
          values={listValues}
          onSet={async (index, value) => {
            if (!connId || !selectedKey) return;
            await setListItem(connId, selectedKey, index, value);
          }}
          onPushLeft={async (value) => {
            if (!connId || !selectedKey) return;
            await lpush(connId, selectedKey, value);
          }}
          onPushRight={async (value) => {
            if (!connId || !selectedKey) return;
            await rpush(connId, selectedKey, value);
          }}
          onRemove={async (value) => {
            if (!connId || !selectedKey) return;
            await lrem(connId, selectedKey, value);
          }}
        />
      );
    }
    if (selectedType === "set") {
      return (
        <SetEditor
          values={setValues}
          onAdd={async (member) => {
            if (!connId || !selectedKey) return;
            await sadd(connId, selectedKey, member);
          }}
          onRemove={async (members) => {
            if (!connId || !selectedKey) return;
            await Promise.all(members.map((member) => srem(connId, selectedKey, member)));
          }}
        />
      );
    }
    if (selectedType === "zset") {
      return (
        <ZSetEditor
          values={zsetValues}
          onUpsert={async (member, score) => {
            if (!connId || !selectedKey) return;
            await zadd(connId, selectedKey, member, score);
          }}
          onRemove={async (member) => {
            if (!connId || !selectedKey) return;
            await zrem(connId, selectedKey, member);
          }}
          onFilter={async (min, max) => {
            if (!connId || !selectedKey) return;
            await zrangeByScore(connId, selectedKey, min, max);
          }}
        />
      );
    }
    return <Typography.Text>Unsupported type: {selectedType}</Typography.Text>;
  }, [
    connId,
    deleteHashField,
    hashFields,
    listValues,
    lpush,
    lrem,
    rpush,
    sadd,
    selectedKey,
    selectedType,
    setHashField,
    setListItem,
    setValues,
    srem,
    stringValue,
    updateString,
    zadd,
    zrangeByScore,
    zrem,
    zsetValues,
  ]);

  if (!connId) {
    return (
      <Card title="Key Browser">
        <Typography.Text type="secondary">
          Please connect to a Redis instance first.
        </Typography.Text>
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Row justify="space-between" align="middle">
        <Col>
          <Space>
            <Typography.Text strong>Active DB</Typography.Text>
            <Select
              size="middle"
              style={{ width: 140 }}
              value={activeDbIndex}
              options={Array.from({ length: 16 }, (_, idx) => ({
                label: `DB ${idx}`,
                value: idx,
              }))}
              onChange={(dbIndex) => {
                void selectDb(connId, dbIndex)
                  .then(async () => {
                    setActiveDbIndex(dbIndex);
                    await fetchConnections();
                    message.success(`Switched to DB ${dbIndex}`);
                  })
                  .catch((err: unknown) => message.error(String(err)));
              }}
            />
          </Space>
        </Col>
        <Col>
          <Typography.Text type="secondary">
            Keys: {keys.length} / Selected: {selectedKeys.length}
          </Typography.Text>
        </Col>
      </Row>
      <Row gutter={12}>
      <Col span={10}>
        <Card title={`Key Tree (DB ${activeDbIndex})`}>
          <KeyTree
            keys={keys}
            loading={loading}
            selectedKeys={selectedKeys}
            onToggleSelect={toggleSelectedKey}
            onSearch={(pattern) => {
              setPattern(pattern);
              resetScan();
              void scanMore(connId);
            }}
            onSelect={(key) => {
              void loadKeyDetail(connId, key);
              setNewName(key);
            }}
            onLoadMore={() => void scanMore(connId)}
          />
          <Space>
            <Button
              danger
              onClick={() => {
                if (selectedKeys.length === 0) return;
                Modal.confirm({
                  title: "Delete selected keys?",
                  content: `${selectedKeys.length} key(s)`,
                  onOk: () =>
                    deleteKeys(connId, selectedKeys).then((deleted) => {
                      message.success(`deleted: ${deleted}`);
                      clearSelectedKeys();
                    }),
                });
              }}
            >
              Batch Delete
            </Button>
            <Input
              style={{ width: 120 }}
              value={batchTtl}
              onChange={(event) => setBatchTtl(event.target.value)}
              placeholder="TTL"
            />
            <Button
              onClick={() => {
                const ttl = Number(batchTtl);
                if (!Number.isFinite(ttl) || ttl <= 0 || selectedKeys.length === 0) return;
                Promise.all(
                  selectedKeys.map((key) =>
                    invoke("cmd_set_ttl", { connId, key, ttlSeconds: ttl }),
                  ),
                ).then(() => message.success("TTL updated"));
              }}
            >
              Batch TTL
            </Button>
          </Space>
        </Card>
      </Col>
      <Col span={14}>
        <Card title="Key Detail">
          <Space direction="vertical" style={{ width: "100%" }}>
            <Space>
              <Select
                value={exportFormat}
                onChange={(value) => setExportFormat(value)}
                options={[
                  { label: "JSON", value: "Json" },
                  { label: "CSV", value: "Csv" },
                ]}
                style={{ width: 100 }}
              />
              <Button
                onClick={() => {
                  const list = selectedKeys.length > 0 ? selectedKeys : selectedKey ? [selectedKey] : [];
                  if (list.length === 0) return;
                  void invoke<string>("cmd_export_keys", {
                    connId,
                    keys: list,
                    format: exportFormat,
                  }).then((path) => message.success(`exported: ${path}`));
                }}
              >
                Export
              </Button>
              <Button
                onClick={() => {
                  void invoke<string | null>("cmd_pick_import_file")
                    .then((path) => {
                      if (!path) {
                        message.info("Put a .json file into app_data/imports and retry.");
                        return;
                      }
                      return invoke<ExportItem[]>("cmd_preview_import_file", {
                        filePath: path,
                        count: 10,
                      }).then((items) => {
                        setImportPreviewPath(path);
                        setImportPreviewItems(items);
                        setImportPreviewOpen(true);
                      });
                    })
                    .catch((err: unknown) => message.error(String(err)));
                }}
              >
                Import
              </Button>
            </Space>
            <Space>
              <Tag color="blue">{selectedType ?? "unknown"}</Tag>
              <Typography.Text>TTL: {selectedTtl}</Typography.Text>
              <Input
                style={{ width: 120 }}
                placeholder="ttl seconds"
                value={ttlInput}
                onChange={(event) => setTtlInput(event.target.value)}
              />
              <Button
                onClick={() => {
                  const ttl = Number(ttlInput);
                  if (!Number.isFinite(ttl) || ttl <= 0) {
                    message.error("invalid TTL");
                    return;
                  }
                  void updateTTL(connId, ttl);
                }}
              >
                Set TTL
              </Button>
            </Space>
            <Space>
              <Input
                style={{ width: 280 }}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <Button
                onClick={() => {
                  if (!selectedKey || !newName || selectedKey === newName) {
                    return;
                  }
                  void renameKey(connId, selectedKey, newName);
                }}
              >
                Rename
              </Button>
              <Button
                danger
                onClick={() => {
                  if (!selectedKey) {
                    return;
                  }
                  void deleteKeys(connId, [selectedKey]).then((deleted) =>
                    message.info(`deleted: ${deleted}`),
                  );
                }}
              >
                Delete
              </Button>
            </Space>
            {details}
          </Space>
        </Card>
      </Col>
      <Modal
        title="Import Preview"
        open={importPreviewOpen}
        onCancel={() => setImportPreviewOpen(false)}
        confirmLoading={importing}
        onOk={() => {
          if (!importPreviewPath) return;
          setImporting(true);
          void invoke<ImportResult>("cmd_import_keys", {
            connId,
            filePath: importPreviewPath,
          })
            .then((result) => {
              message.info(
                `import done: success=${result.successCount}, failed=${result.failedCount}`,
              );
              setImportPreviewOpen(false);
              if (result.failedCount > 0) {
                Modal.info({
                  title: "Import Errors",
                  width: 720,
                  content: (
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {result.errors.map((err, idx) => (
                        <Typography.Text key={`${idx}-${err}`} type="danger">
                          {err}
                        </Typography.Text>
                      ))}
                    </Space>
                  ),
                });
              }
            })
            .catch((err: unknown) => message.error(String(err)))
            .finally(() => setImporting(false));
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            file: {importPreviewPath}
          </Typography.Text>
          {importPreviewItems.length === 0 ? (
            <Typography.Text type="secondary">No preview rows.</Typography.Text>
          ) : (
            importPreviewItems.map((item) => (
              <Card key={item.key} size="small">
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="Key">{item.key}</Descriptions.Item>
                  <Descriptions.Item label="Type">{item.keyType}</Descriptions.Item>
                  <Descriptions.Item label="TTL">{item.ttl}</Descriptions.Item>
                </Descriptions>
              </Card>
            ))
          )}
        </Space>
      </Modal>
      </Row>
    </Space>
  );
}
