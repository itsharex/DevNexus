import { Button, Input, List, Space, Typography } from "antd";
import { useMemo, useState } from "react";

interface SetEditorProps {
  values: string[];
  onAdd: (member: string) => Promise<void>;
  onRemove: (members: string[]) => Promise<void>;
}

export function SetEditor({ values, onAdd, onRemove }: SetEditorProps) {
  const [keyword, setKeyword] = useState("");
  const [newMember, setNewMember] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const filtered = useMemo(
    () => values.filter((item) => item.includes(keyword)),
    [values, keyword],
  );

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Typography.Text type="secondary">Members: {values.length}</Typography.Text>
      <Space>
        <Input
          placeholder="Search member"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Input
          placeholder="new member"
          value={newMember}
          onChange={(event) => setNewMember(event.target.value)}
        />
        <Button
          onClick={() => {
            const value = newMember.trim();
            if (!value) return;
            void onAdd(value).then(() => setNewMember(""));
          }}
        >
          Add
        </Button>
        <Button
          danger
          onClick={() => {
            if (selectedMembers.length === 0) return;
            void onRemove(selectedMembers).then(() => setSelectedMembers([]));
          }}
        >
          Remove Selected
        </Button>
      </Space>
      <List
        bordered
        dataSource={filtered}
        renderItem={(item) => (
          <List.Item
            onClick={() =>
              setSelectedMembers((prev) =>
                prev.includes(item)
                  ? prev.filter((value) => value !== item)
                  : [...prev, item],
              )
            }
            style={{
              cursor: "pointer",
              background: selectedMembers.includes(item) ? "#e6f4ff" : undefined,
            }}
          >
            {item}
          </List.Item>
        )}
      />
    </Space>
  );
}
