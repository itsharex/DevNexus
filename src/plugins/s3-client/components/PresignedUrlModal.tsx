import { App, Button, Input, Modal, Select, Space } from "antd";
import { useState } from "react";

interface PresignedUrlModalProps {
  open: boolean;
  objectKey: string | null;
  onClose: () => void;
  onGenerate: (expiresSecs: number) => Promise<string>;
}

export function PresignedUrlModal({
  open,
  objectKey,
  onClose,
  onGenerate,
}: PresignedUrlModalProps) {
  const { message } = App.useApp();
  const [expiresSecs, setExpiresSecs] = useState(3600);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <Modal title={objectKey ?? "Presigned URL"} open={open} onCancel={onClose} footer={null}>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Select
          value={expiresSecs}
          options={[
            { label: "5 minutes", value: 300 },
            { label: "1 hour", value: 3600 },
            { label: "1 day", value: 86400 },
            { label: "7 days", value: 604800 },
          ]}
          onChange={setExpiresSecs}
          style={{ width: "100%" }}
        />
        <Button
          type="primary"
          loading={loading}
          onClick={() => {
            setLoading(true);
            void onGenerate(expiresSecs)
              .then((value) => setUrl(value))
              .catch((err: unknown) => message.error(String(err)))
              .finally(() => setLoading(false));
          }}
        >
          Generate
        </Button>
        <Input.TextArea value={url} autoSize readOnly />
        <Button
          disabled={!url}
          onClick={() =>
            void navigator.clipboard?.writeText(url).then(() => message.success("URL copied"))
          }
        >
          Copy URL
        </Button>
      </Space>
    </Modal>
  );
}
