import { App, Button, Input, Modal, Select, Space, Typography } from "antd";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

interface ObjectPreviewProps {
  open: boolean;
  connId: string;
  bucket: string;
  objectKey: string | null;
  contentType?: string;
  onClose: () => void;
}

export function ObjectPreview({
  open,
  connId,
  bucket,
  objectKey,
  contentType,
  onClose,
}: ObjectPreviewProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [expiresSecs, setExpiresSecs] = useState(3600);

  const isText = useMemo(() => {
    const type = contentType?.toLowerCase() ?? "";
    return (
      type.startsWith("text/") ||
      type.includes("json") ||
      type.includes("xml") ||
      type.includes("yaml") ||
      type.includes("javascript")
    );
  }, [contentType]);

  useEffect(() => {
    if (!open || !objectKey) {
      setText("");
      setUrl("");
      return;
    }
    setLoading(true);
    const task = isText
      ? invoke<string>("cmd_s3_get_object_text", {
          connId,
          bucket,
          key: objectKey,
          versionId: null,
        }).then((value) => setText(value))
      : invoke<string>("cmd_s3_generate_presigned_url", {
          connId,
          bucket,
          key: objectKey,
          expiresSecs,
          versionId: null,
        }).then((value) => setUrl(value));
    void task.catch((err: unknown) => message.error(String(err))).finally(() => setLoading(false));
  }, [bucket, connId, expiresSecs, isText, message, objectKey, open]);

  return (
    <Modal
      title={objectKey ?? "Preview"}
      open={open}
      onCancel={onClose}
      width={900}
      footer={
        <Space>
          <Select
            value={expiresSecs}
            style={{ width: 140 }}
            options={[
              { label: "5 minutes", value: 300 },
              { label: "1 hour", value: 3600 },
              { label: "1 day", value: 86400 },
              { label: "7 days", value: 604800 },
            ]}
            onChange={setExpiresSecs}
          />
          <Button
            onClick={() => {
              if (!objectKey) return;
              void invoke<string>("cmd_s3_generate_presigned_url", {
                connId,
                bucket,
                key: objectKey,
                expiresSecs,
                versionId: null,
              }).then((value) => {
                setUrl(value);
                void navigator.clipboard?.writeText(value);
                message.success("URL copied");
              });
            }}
          >
            Copy Presigned URL
          </Button>
          <Button onClick={onClose}>Close</Button>
        </Space>
      }
    >
      {loading ? (
        <Typography.Text type="secondary">Loading...</Typography.Text>
      ) : isText ? (
        <pre style={{ maxHeight: 560, overflow: "auto", whiteSpace: "pre-wrap" }}>{text}</pre>
      ) : contentType?.startsWith("image/") && url ? (
        <img src={url} alt={objectKey ?? "preview"} style={{ maxWidth: "100%", maxHeight: 560 }} />
      ) : url ? (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            Preview is available through a temporary signed URL.
          </Typography.Text>
          <Input.TextArea value={url} autoSize readOnly />
        </Space>
      ) : (
        <Typography.Text type="secondary">No preview available.</Typography.Text>
      )}
    </Modal>
  );
}
