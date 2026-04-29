import { Button, Input, Space, Typography } from "antd";
import { useMemo, useState } from "react";

interface StringEditorProps {
  value: string;
  onSave: (value: string) => void | Promise<void>;
}

export function StringEditor({ value, onSave }: StringEditorProps) {
  const [draft, setDraft] = useState(value);
  const size = useMemo(() => new TextEncoder().encode(draft).length, [draft]);
  const looksLikeJson = useMemo(() => {
    const text = draft.trim();
    return (text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"));
  }, [draft]);

  const formatJson = () => {
    try {
      const parsed = JSON.parse(draft);
      setDraft(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore invalid json
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space>
        <Button onClick={formatJson} disabled={!looksLikeJson}>
          Format JSON
        </Button>
        <Button type="primary" onClick={() => onSave(draft)}>
          Save
        </Button>
      </Space>
      <Input.TextArea
        value={draft}
        rows={12}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Typography.Text type="secondary">{size} bytes</Typography.Text>
    </Space>
  );
}
