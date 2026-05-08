import { App, Button, Card, Col, Empty, Input, List, Row, Space, Statistic, Typography } from "antd";
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";

import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";

export function DatabaseBrowser() {
  const { modal } = App.useApp();
  const activeConnId = useMongoConnectionsStore((state) => state.activeConnId);
  const activeDatabase = useMongoConnectionsStore((state) => state.activeDatabase);
  const activeCollection = useMongoConnectionsStore((state) => state.activeCollection);
  const databases = useMongoConnectionsStore((state) => state.databases);
  const collections = useMongoConnectionsStore((state) => state.collections);
  const collectionStats = useMongoConnectionsStore((state) => state.collectionStats);
  const setActiveNamespace = useMongoConnectionsStore((state) => state.setActiveNamespace);
  const setWorkspaceTab = useMongoConnectionsStore((state) => state.setWorkspaceTab);
  const listDatabases = useMongoConnectionsStore((state) => state.listDatabases);
  const listCollections = useMongoConnectionsStore((state) => state.listCollections);
  const getCollectionStats = useMongoConnectionsStore((state) => state.getCollectionStats);
  const createCollection = useMongoConnectionsStore((state) => state.createCollection);
  const dropCollection = useMongoConnectionsStore((state) => state.dropCollection);
  const [newCollection, setNewCollection] = useState("");

  useEffect(() => {
    if (activeConnId) void listDatabases();
  }, [activeConnId, listDatabases]);

  if (!activeConnId) {
    return <Empty description="Connect to MongoDB first." />;
  }

  return (
    <Row gutter={12} style={{ height: "100%", minWidth: 980 }}>
      <Col span={7}>
        <Card
          title="Databases"
          extra={<Button icon={<ReloadOutlined />} onClick={() => void listDatabases()} />}
          style={{ height: "100%", overflow: "auto" }}
        >
          <List
            dataSource={databases}
            renderItem={(db) => (
              <List.Item
                style={{ cursor: "pointer", background: activeDatabase === db.name ? "#e6f4ff" : undefined }}
                onClick={() => {
                  setActiveNamespace(db.name, null);
                  void listCollections(db.name);
                }}
              >
                <List.Item.Meta
                  title={db.name}
                  description={`${db.sizeOnDisk.toLocaleString()} bytes${db.empty ? " / empty" : ""}`}
                />
              </List.Item>
            )}
          />
        </Card>
      </Col>
      <Col span={9}>
        <Card
          title={`Collections${activeDatabase ? ` / ${activeDatabase}` : ""}`}
          extra={
            <Space.Compact>
              <Input
                placeholder="new collection"
                value={newCollection}
                onChange={(event) => setNewCollection(event.target.value)}
              />
              <Button
                icon={<PlusOutlined />}
                disabled={!activeDatabase || !newCollection.trim()}
                onClick={() => {
                  if (!activeDatabase) return;
                  void createCollection(activeDatabase, newCollection.trim()).then(() => setNewCollection(""));
                }}
              />
            </Space.Compact>
          }
          style={{ height: "100%", overflow: "auto" }}
        >
          <List
            dataSource={collections}
            renderItem={(collection) => (
              <List.Item
                style={{ cursor: "pointer", background: activeCollection === collection.name ? "#e6f4ff" : undefined }}
                actions={[
                  <Button
                    key="delete"
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!activeDatabase) return;
                      modal.confirm({
                        title: "Drop collection?",
                        content: `${activeDatabase}.${collection.name}`,
                        okButtonProps: { danger: true },
                        onOk: () => dropCollection(activeDatabase, collection.name),
                      });
                    }}
                  />,
                ]}
                onClick={() => {
                  if (!activeDatabase) return;
                  setActiveNamespace(activeDatabase, collection.name);
                  void getCollectionStats(activeDatabase, collection.name);
                  setWorkspaceTab("documents");
                }}
              >
                <List.Item.Meta title={collection.name} description={collection.collectionType} />
              </List.Item>
            )}
          />
        </Card>
      </Col>
      <Col span={8}>
        <Card title="Collection Stats" style={{ height: "100%", overflow: "auto" }}>
          {collectionStats ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Typography.Text strong>
                {activeDatabase}.{activeCollection}
              </Typography.Text>
              <Statistic title="Documents" value={collectionStats.count} />
              <Statistic title="Data Size" value={collectionStats.size} suffix="bytes" />
              <Statistic title="Storage Size" value={collectionStats.storageSize} suffix="bytes" />
              <Statistic title="Index Size" value={collectionStats.totalIndexSize} suffix="bytes" />
            </Space>
          ) : (
            <Empty description="Select a collection." />
          )}
        </Card>
      </Col>
    </Row>
  );
}
