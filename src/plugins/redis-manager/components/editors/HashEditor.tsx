import { Button, Input, Space, Table } from "antd";
import { useMemo, useState } from "react";

import type { HashField } from "@/plugins/redis-manager/types";

interface HashEditorProps {
  rows: HashField[];
  onSet: (field: string, value: string) => Promise<void>;
  onDelete: (field: string) => Promise<void>;
}

export function HashEditor({ rows, onSet, onDelete }: HashEditorProps) {
  const [keyword, setKeyword] = useState("");
  const [newField, setNewField] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const data = useMemo(
    () =>
      rows.filter((item) =>
        item.field.toLowerCase().includes(keyword.trim().toLowerCase()),
      ),
    [rows, keyword],
  );

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space>
        <Input
          placeholder="Search field"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </Space>
      <Space>
        <Input
          placeholder="Field"
          value={newField}
          onChange={(event) => setNewField(event.target.value)}
        />
        <Input
          placeholder="Value"
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
        />
        <Button
          type="primary"
          onClick={() => {
            const field = newField.trim();
            if (!field) {
              return;
            }
            void onSet(field, newValue).then(() => {
              setNewField("");
              setNewValue("");
            });
          }}
        >
          Add Field
        </Button>
      </Space>
      <Table
        size="small"
        rowKey="field"
        dataSource={data}
        columns={[
          { title: "Field", dataIndex: "field", key: "field" },
          {
            title: "Value",
            key: "value",
            render: (_, row) =>
              editingField === row.field ? (
                <Space>
                  <Input
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                  />
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      void onSet(row.field, editingValue).then(() => {
                        setEditingField(null);
                        setEditingValue("");
                      });
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditingField(null);
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
                    setEditingField(row.field);
                    setEditingValue(row.value);
                  }}
                >
                  {row.value}
                </Button>
              ),
          },
          {
            title: "Action",
            key: "action",
            render: (_, row) => (
              <Button danger onClick={() => void onDelete(row.field)}>
                Delete
              </Button>
            ),
          },
        ]}
        pagination={false}
      />
    </Space>
  );
}
