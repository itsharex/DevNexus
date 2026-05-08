import { App, Button, Card, Drawer, Empty, Input, List, Pagination, Space, Typography } from "antd";
import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";

import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";

const DEFAULT_FILTER = "{}";

function prettyJson(text: string): string {
  return JSON.stringify(JSON.parse(text), null, 2);
}

function idFilterFromDocument(text: string): string {
  const parsed = JSON.parse(text) as { _id?: unknown };
  if (parsed._id === undefined) throw new Error("Document has no _id.");
  return JSON.stringify({ _id: parsed._id });
}

export function DocumentBrowser() {
  const { message, modal } = App.useApp();
  const activeConnId = useMongoConnectionsStore((state) => state.activeConnId);
  const activeDatabase = useMongoConnectionsStore((state) => state.activeDatabase);
  const activeCollection = useMongoConnectionsStore((state) => state.activeCollection);
  const documents = useMongoConnectionsStore((state) => state.documents);
  const total = useMongoConnectionsStore((state) => state.documentTotal);
  const findDocuments = useMongoConnectionsStore((state) => state.findDocuments);
  const insertDocument = useMongoConnectionsStore((state) => state.insertDocument);
  const updateDocument = useMongoConnectionsStore((state) => state.updateDocument);
  const deleteDocuments = useMongoConnectionsStore((state) => state.deleteDocuments);
  const [filterJson, setFilterJson] = useState(DEFAULT_FILTER);
  const [projectionJson, setProjectionJson] = useState("");
  const [sortJson, setSortJson] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("{}");

  const namespace = useMemo(
    () => (activeDatabase && activeCollection ? `${activeDatabase}.${activeCollection}` : ""),
    [activeCollection, activeDatabase],
  );

  const load = async (nextPage = page, nextLimit = limit) => {
    await findDocuments({
      filterJson,
      projectionJson: projectionJson || undefined,
      sortJson: sortJson || undefined,
      skip: (nextPage - 1) * nextLimit,
      limit: nextLimit,
    });
  };

  useEffect(() => {
    if (activeConnId && activeDatabase && activeCollection) void load(1, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnId, activeDatabase, activeCollection]);

  if (!activeConnId || !activeDatabase || !activeCollection) {
    return <Empty description="Select a MongoDB collection first." />;
  }

  return (
    <Card
      title={`Documents / ${namespace}`}
      extra={
        <Space>
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingDoc(null);
              setEditorValue("{\n  \n}");
              setDrawerOpen(true);
            }}
          >
            Insert
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            Refresh
          </Button>
        </Space>
      }
      style={{ height: "100%", overflow: "auto", minWidth: 980 }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Input.TextArea
          value={filterJson}
          onChange={(event) => setFilterJson(event.target.value)}
          autoSize={{ minRows: 2, maxRows: 6 }}
          placeholder="Filter JSON"
        />
        <Space.Compact style={{ width: "100%" }}>
          <Input value={projectionJson} onChange={(event) => setProjectionJson(event.target.value)} placeholder="Projection JSON optional" />
          <Input value={sortJson} onChange={(event) => setSortJson(event.target.value)} placeholder="Sort JSON optional" />
          <Button
            type="primary"
            onClick={() => {
              setPage(1);
              void load(1, limit);
            }}
          >
            Find
          </Button>
        </Space.Compact>
        <List
          bordered
          dataSource={documents}
          renderItem={(doc) => (
            <List.Item
              actions={[
                <Button
                  key="copy"
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void navigator.clipboard.writeText(doc);
                    message.success("Copied");
                  }}
                />,
                <Button
                  key="edit"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditingDoc(doc);
                    setEditorValue(doc);
                    setDrawerOpen(true);
                  }}
                />,
                <Button
                  key="delete"
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    modal.confirm({
                      title: "Delete document?",
                      content: "This deletes the document by _id.",
                      okButtonProps: { danger: true },
                      onOk: async () => {
                        await deleteDocuments(idFilterFromDocument(doc));
                        message.success("Deleted");
                      },
                    })
                  }
                />,
              ]}
            >
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{doc}</pre>
            </List.Item>
          )}
        />
        <Pagination
          current={page}
          pageSize={limit}
          total={total}
          showSizeChanger
          onChange={(nextPage, nextLimit) => {
            setPage(nextPage);
            setLimit(nextLimit);
            void load(nextPage, nextLimit);
          }}
        />
      </Space>
      <Drawer
        open={drawerOpen}
        title={editingDoc ? "Edit Document" : "Insert Document"}
        width={720}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setEditorValue(prettyJson(editorValue))}>Format</Button>
            <Button
              type="primary"
              onClick={async () => {
                const formatted = prettyJson(editorValue);
                if (editingDoc) {
                  await updateDocument(idFilterFromDocument(editingDoc), formatted);
                  message.success("Document updated");
                } else {
                  await insertDocument(formatted);
                  message.success("Document inserted");
                }
                setDrawerOpen(false);
              }}
            >
              Save
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          MongoDB special values should use Extended JSON when needed, for example ObjectId wrappers.
        </Typography.Paragraph>
        <Input.TextArea
          value={editorValue}
          onChange={(event) => setEditorValue(event.target.value)}
          style={{ minHeight: 520, fontFamily: "Consolas, monospace" }}
        />
      </Drawer>
    </Card>
  );
}
