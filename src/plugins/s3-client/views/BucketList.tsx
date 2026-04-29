import {
  App,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";

import { useS3ConnectionsStore } from "@/plugins/s3-client/store/s3-connections";

export function BucketList() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const activeConnId = useS3ConnectionsStore((state) => state.activeConnId);
  const buckets = useS3ConnectionsStore((state) => state.buckets);
  const loading = useS3ConnectionsStore((state) => state.bucketLoading);
  const listBuckets = useS3ConnectionsStore((state) => state.listBuckets);
  const createBucket = useS3ConnectionsStore((state) => state.createBucket);
  const deleteBucket = useS3ConnectionsStore((state) => state.deleteBucket);
  const selectBucket = useS3ConnectionsStore((state) => state.selectBucket);
  const listObjects = useS3ConnectionsStore((state) => state.listObjects);
  const setObjectPrefix = useS3ConnectionsStore((state) => state.setObjectPrefix);
  const setWorkspaceTab = useS3ConnectionsStore((state) => state.setWorkspaceTab);
  const [createOpen, setCreateOpen] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return buckets;
    return buckets.filter((item) => item.name.toLowerCase().includes(text));
  }, [buckets, keyword]);

  useEffect(() => {
    setPage(1);
  }, [keyword, buckets.length]);

  if (!activeConnId) {
    return (
      <Card title="Buckets">
        <Empty description="No active S3 connection" />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <Typography.Text strong>Buckets</Typography.Text>
          <Typography.Text type="secondary">Connection: {activeConnId}</Typography.Text>
        </Space>
      }
      extra={
        <Space>
          <Input.Search
            placeholder="Search bucket"
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 240 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            New Bucket
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() =>
              void listBuckets(activeConnId).then(() => message.success("Buckets refreshed"))
            }
          >
            Refresh
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="name"
        loading={loading}
        dataSource={filtered}
        onRow={(record) => ({
          onDoubleClick: () => {
            selectBucket(record.name);
            setObjectPrefix("");
            setWorkspaceTab("objects");
            void listObjects({ connId: activeConnId, bucket: record.name });
          },
        })}
        pagination={{
          current: page,
          pageSize,
          total: filtered.length,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (total) => `Total ${total} buckets`,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            if (nextPageSize && nextPageSize !== pageSize) {
              setPageSize(nextPageSize);
            }
          },
        }}
        columns={[
          { title: "Bucket", dataIndex: "name" },
          {
            title: "Created",
            dataIndex: "creationDate",
            render: (value: string | undefined) => value || "-",
          },
          {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
              <Space>
                <Button
                  type="link"
                  onClick={() => {
                    selectBucket(record.name);
                    setObjectPrefix("");
                    setWorkspaceTab("objects");
                    void listObjects({ connId: activeConnId, bucket: record.name });
                  }}
                >
                  Open
                </Button>
                <Popconfirm
                  title={`Delete bucket ${record.name}?`}
                  description="Bucket must be empty before delete."
                  onConfirm={() =>
                    void deleteBucket(activeConnId, record.name).then(() =>
                      message.success(`Deleted: ${record.name}`),
                    )
                  }
                >
                  <Button danger type="link">
                    Delete
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title="Create Bucket"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => {
          const value = newBucketName.trim();
          if (!value) {
            message.error("bucket name is required");
            return;
          }
          void createBucket(activeConnId, value).then(() => {
            message.success(`Bucket created: ${value}`);
            setCreateOpen(false);
            setNewBucketName("");
          });
        }}
      >
        <Input
          placeholder="bucket-name"
          value={newBucketName}
          onChange={(event) => setNewBucketName(event.target.value)}
        />
      </Modal>
    </Card>
  );
}
