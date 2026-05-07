import { App, Button, Descriptions, Drawer, Input, Space, Table, Typography } from "antd";
import { useEffect, useState } from "react";

import type { S3ObjectMeta, S3ObjectTag } from "@/plugins/s3-client/types";

interface ObjectMetaDrawerProps {
  open: boolean;
  meta: S3ObjectMeta | null;
  tags: S3ObjectTag[];
  onClose: () => void;
  onReloadTags: () => void;
  onSaveTags: (tags: S3ObjectTag[]) => Promise<void>;
}

export function ObjectMetaDrawer({
  open,
  meta,
  tags,
  onClose,
  onReloadTags,
  onSaveTags,
}: ObjectMetaDrawerProps) {
  const { message } = App.useApp();
  const [draftTags, setDraftTags] = useState<S3ObjectTag[]>([]);

  useEffect(() => {
    setDraftTags(tags);
  }, [tags]);

  return (
    <Drawer title="Object Details" open={open} onClose={onClose} width={620}>
      {!meta ? (
        <Typography.Text type="secondary">No object selected.</Typography.Text>
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Key">{meta.key}</Descriptions.Item>
            <Descriptions.Item label="Content Type">{meta.contentType || "-"}</Descriptions.Item>
            <Descriptions.Item label="Size">{meta.contentLength}</Descriptions.Item>
            <Descriptions.Item label="ETag">{meta.etag || "-"}</Descriptions.Item>
            <Descriptions.Item label="Last Modified">{meta.lastModified || "-"}</Descriptions.Item>
            <Descriptions.Item label="Storage Class">{meta.storageClass || "-"}</Descriptions.Item>
            <Descriptions.Item label="Version ID">{meta.versionId || "-"}</Descriptions.Item>
          </Descriptions>

          <Typography.Text strong>Metadata</Typography.Text>
          <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={Object.entries(meta.metadata).map(([key, value]) => ({ key, value }))}
            columns={[
              { title: "Key", dataIndex: "key" },
              { title: "Value", dataIndex: "value" },
            ]}
          />

          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Typography.Text strong>Tags</Typography.Text>
            <Space>
              <Button size="small" onClick={onReloadTags}>
                Reload
              </Button>
              <Button
                size="small"
                onClick={() => setDraftTags([...draftTags, { key: "", value: "" }])}
              >
                Add
              </Button>
              <Button
                size="small"
                type="primary"
                onClick={() =>
                  onSaveTags(draftTags.filter((tag) => tag.key.trim())).then(() =>
                    message.success("Tags saved"),
                  )
                }
              >
                Save
              </Button>
            </Space>
          </Space>
          <Table
            size="small"
            pagination={false}
            rowKey={(_, index) => String(index)}
            dataSource={draftTags}
            columns={[
              {
                title: "Key",
                dataIndex: "key",
                render: (value: string, _record, index) => (
                  <Input
                    value={value}
                    onChange={(event) => {
                      const next = [...draftTags];
                      next[index] = { ...next[index], key: event.target.value };
                      setDraftTags(next);
                    }}
                  />
                ),
              },
              {
                title: "Value",
                dataIndex: "value",
                render: (value: string, _record, index) => (
                  <Input
                    value={value}
                    onChange={(event) => {
                      const next = [...draftTags];
                      next[index] = { ...next[index], value: event.target.value };
                      setDraftTags(next);
                    }}
                  />
                ),
              },
              {
                title: "Actions",
                width: 100,
                render: (_, _record, index) => (
                  <Button
                    danger
                    type="link"
                    onClick={() => setDraftTags(draftTags.filter((_, idx) => idx !== index))}
                  >
                    Delete
                  </Button>
                ),
              },
            ]}
          />
        </Space>
      )}
    </Drawer>
  );
}
