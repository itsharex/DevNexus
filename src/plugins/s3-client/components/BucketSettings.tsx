import { App, Button, Descriptions, Input, Modal, Space, Switch, Table, Tabs, Typography } from "antd";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import type { S3BucketStats } from "@/plugins/s3-client/types";

interface BucketSettingsProps {
  open: boolean;
  connId: string;
  bucket: string | null;
  onClose: () => void;
}

export function BucketSettings({ open, connId, bucket, onClose }: BucketSettingsProps) {
  const { message } = App.useApp();
  const [region, setRegion] = useState("");
  const [versioning, setVersioning] = useState("Disabled");
  const [stats, setStats] = useState<S3BucketStats | null>(null);
  const [policy, setPolicy] = useState("");

  useEffect(() => {
    if (!open || !bucket) return;
    void Promise.all([
      invoke<string>("cmd_s3_get_bucket_location", { connId, bucket }).then(setRegion),
      invoke<string>("cmd_s3_get_bucket_versioning", { connId, bucket }).then(setVersioning),
      invoke<S3BucketStats>("cmd_s3_get_bucket_stats", { connId, bucket, prefix: null }).then(setStats),
      invoke<string>("cmd_s3_get_bucket_policy", { connId, bucket }).then(setPolicy),
    ]).catch((err: unknown) => message.error(String(err)));
  }, [bucket, connId, message, open]);

  return (
    <Modal title={`Bucket Settings: ${bucket ?? ""}`} open={open} onCancel={onClose} footer={null} width={820}>
      {!bucket ? null : (
        <Tabs
          items={[
            {
              key: "overview",
              label: "Overview",
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Descriptions bordered size="small" column={1}>
                    <Descriptions.Item label="Bucket">{bucket}</Descriptions.Item>
                    <Descriptions.Item label="Region">{region || "-"}</Descriptions.Item>
                    <Descriptions.Item label="Objects">{stats?.objectCount ?? "-"}</Descriptions.Item>
                    <Descriptions.Item label="Total Size">{stats?.totalSize ?? "-"}</Descriptions.Item>
                  </Descriptions>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="storageClass"
                    dataSource={Object.entries(stats?.storageClassBreakdown ?? {}).map(
                      ([storageClass, count]) => ({ storageClass, count }),
                    )}
                    columns={[
                      { title: "Storage Class", dataIndex: "storageClass" },
                      { title: "Objects", dataIndex: "count" },
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: "versioning",
              label: "Versioning",
              children: (
                <Space>
                  <Typography.Text>Enabled</Typography.Text>
                  <Switch
                    checked={versioning === "Enabled"}
                    onChange={(checked) =>
                      void invoke("cmd_s3_set_bucket_versioning", {
                        connId,
                        bucket,
                        enabled: checked,
                      })
                        .then(() => {
                          setVersioning(checked ? "Enabled" : "Suspended");
                          message.success("Versioning updated");
                        })
                        .catch((err: unknown) => message.error(String(err)))
                    }
                  />
                  <Typography.Text type="secondary">{versioning}</Typography.Text>
                </Space>
              ),
            },
            {
              key: "policy",
              label: "Policy",
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Input.TextArea
                    value={policy}
                    onChange={(event) => setPolicy(event.target.value)}
                    autoSize={{ minRows: 12, maxRows: 22 }}
                    placeholder="{ }"
                  />
                  <Space>
                    <Button
                      type="primary"
                      onClick={() =>
                        void invoke("cmd_s3_set_bucket_policy", {
                          connId,
                          bucket,
                          policyJson: policy,
                        })
                          .then(() => message.success("Policy saved"))
                          .catch((err: unknown) => message.error(String(err)))
                      }
                    >
                      Save Policy
                    </Button>
                    <Button
                      danger
                      onClick={() =>
                        void invoke("cmd_s3_delete_bucket_policy", { connId, bucket })
                          .then(() => {
                            setPolicy("");
                            message.success("Policy deleted");
                          })
                          .catch((err: unknown) => message.error(String(err)))
                      }
                    >
                      Delete Policy
                    </Button>
                  </Space>
                </Space>
              ),
            },
          ]}
        />
      )}
    </Modal>
  );
}
