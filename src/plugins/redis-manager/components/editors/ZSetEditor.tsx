import { Button, Input, InputNumber, Space, Table } from "antd";
import { useMemo, useState } from "react";

import type { ZMember } from "@/plugins/redis-manager/types";

interface ZSetEditorProps {
  values: ZMember[];
  onUpsert: (member: string, score: number) => Promise<void>;
  onRemove: (member: string) => Promise<void>;
  onFilter: (min: number, max: number) => Promise<void>;
}

export function ZSetEditor({ values, onUpsert, onRemove, onFilter }: ZSetEditorProps) {
  const [member, setMember] = useState("");
  const [score, setScore] = useState<number>(0);
  const [minScore, setMinScore] = useState<number>(Number.NEGATIVE_INFINITY);
  const [maxScore, setMaxScore] = useState<number>(Number.POSITIVE_INFINITY);
  const sorted = useMemo(() => [...values].sort((a, b) => a.score - b.score), [values]);

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space>
        <InputNumber
          placeholder="Min score"
          value={Number.isFinite(minScore) ? minScore : undefined}
          onChange={(value) => setMinScore(value ?? Number.NEGATIVE_INFINITY)}
        />
        <InputNumber
          placeholder="Max score"
          value={Number.isFinite(maxScore) ? maxScore : undefined}
          onChange={(value) => setMaxScore(value ?? Number.POSITIVE_INFINITY)}
        />
        <Button onClick={() => void onFilter(minScore, maxScore)}>Filter</Button>
      </Space>
      <Space>
        <Input
          placeholder="member"
          value={member}
          onChange={(event) => setMember(event.target.value)}
        />
        <InputNumber
          placeholder="score"
          value={score}
          onChange={(value) => setScore(value ?? 0)}
        />
        <Button
          type="primary"
          onClick={() => {
            const m = member.trim();
            if (!m) return;
            void onUpsert(m, score).then(() => {
              setMember("");
              setScore(0);
            });
          }}
        >
          Add/Update
        </Button>
      </Space>
      <Table
        size="small"
        rowKey="member"
        dataSource={sorted}
        columns={[
          { title: "Member", dataIndex: "member", key: "member" },
          { title: "Score", dataIndex: "score", key: "score" },
          {
            title: "Action",
            key: "action",
            render: (_, row) => (
              <Button danger onClick={() => void onRemove(row.member)}>
                Remove
              </Button>
            ),
          },
        ]}
        pagination={{ pageSize: 100 }}
      />
    </Space>
  );
}
