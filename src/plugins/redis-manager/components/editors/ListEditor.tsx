import { Button, Input, Space, Table } from "antd";
import { useMemo, useState } from "react";

interface ListEditorProps {
  values: string[];
  onSet: (index: number, value: string) => Promise<void>;
  onPushLeft: (value: string) => Promise<void>;
  onPushRight: (value: string) => Promise<void>;
  onRemove: (value: string) => Promise<void>;
}

export function ListEditor({
  values,
  onSet,
  onPushLeft,
  onPushRight,
  onRemove,
}: ListEditorProps) {
  const [newValue, setNewValue] = useState("");
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const data = useMemo(
    () => values.map((value, index) => ({ key: `${index}-${value}`, index, value })),
    [values],
  );

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space>
        <Input
          placeholder="value"
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
        />
        <Button
          onClick={() => {
            if (!newValue) return;
            void onPushLeft(newValue).then(() => setNewValue(""));
          }}
        >
          LPUSH
        </Button>
        <Button
          onClick={() => {
            if (!newValue) return;
            void onPushRight(newValue).then(() => setNewValue(""));
          }}
        >
          RPUSH
        </Button>
        <Button
          danger
          onClick={() => {
            if (!selectedValue) return;
            void onRemove(selectedValue).then(() => setSelectedValue(null));
          }}
        >
          LREM
        </Button>
      </Space>
      <Table
        size="small"
        rowKey="key"
        rowSelection={{
          type: "radio",
          selectedRowKeys: selectedValue ? data.filter((item) => item.value === selectedValue).map((item) => item.key) : [],
          onChange: (_selectedRowKeys, rows) => setSelectedValue(rows[0]?.value ?? null),
        }}
        dataSource={data}
        columns={[
          { title: "Index", dataIndex: "index", key: "index", width: 80 },
          {
            title: "Value",
            key: "value",
            render: (_, row) =>
              editingIndex === row.index ? (
                <Space>
                  <Input
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                  />
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      void onSet(row.index, editingValue).then(() => {
                        setEditingIndex(null);
                        setEditingValue("");
                      });
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditingIndex(null);
                      setEditingValue("");
                    }}
                  >
                    Cancel
                  </Button>
                </Space>
              ) : (
                <Button
                  type="link"
                  onClick={() => {
                    setEditingIndex(row.index);
                    setEditingValue(row.value);
                  }}
                >
                  {row.value}
                </Button>
              ),
          },
        ]}
        pagination={{ pageSize: 100 }}
      />
    </Space>
  );
}
