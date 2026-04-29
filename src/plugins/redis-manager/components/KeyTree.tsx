import { useMemo, useRef } from "react";
import { Badge, Button, Checkbox, Input, Space, Tag, Typography } from "antd";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { KeyMeta } from "@/plugins/redis-manager/types";
import { TtlBadge } from "@/plugins/redis-manager/components/TtlBadge";

interface KeyTreeProps {
  keys: KeyMeta[];
  loading: boolean;
  selectedKeys: string[];
  onToggleSelect: (key: string, checked: boolean) => void;
  onSelect: (key: string) => void;
  onLoadMore: () => void;
  onSearch: (pattern: string) => void;
}

export function KeyTree({
  keys,
  loading,
  selectedKeys,
  onToggleSelect,
  onSelect,
  onLoadMore,
  onSearch,
}: KeyTreeProps) {
  const rows = useMemo(() => {
    type Row = { kind: "group"; key: string; label: string; count: number } | { kind: "key"; key: string; item: KeyMeta };
    const list: Row[] = [];
    const map = new Map<string, KeyMeta[]>();
    for (const item of keys) {
      const top = item.key.split(":")[0] || "(root)";
      map.set(top, [...(map.get(top) ?? []), item]);
    }
    for (const [group, items] of map.entries()) {
      list.push({
        kind: "group",
        key: `group-${group}`,
        label: group,
        count: items.length,
      });
      for (const item of items) {
        list.push({
          kind: "key",
          key: `key-${item.key}`,
          item,
        });
      }
    }
    return list;
  }, [keys]);

  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.kind === "group" ? 36 : 40),
    overscan: 16,
  });

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Input.Search
        placeholder="pattern, e.g. user:*"
        onSearch={(value) => onSearch(value || "*")}
        allowClear
      />
      <div
        ref={(node) => {
          parentRef.current = node;
        }}
        style={{
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          height: 420,
          overflow: "auto",
          position: "relative",
        }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (!row) {
              return null;
            }
            if (row.kind === "group") {
              return (
                <div
                  key={row.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                    padding: "8px 10px",
                    background: "#fafafa",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  <Badge count={row.count} offset={[8, 0]}>
                    <Tag color="blue">{row.label}</Tag>
                  </Badge>
                </div>
              );
            }

            const segments = row.item.key.split(":");
            const shortName = segments[segments.length - 1] || row.item.key;
            return (
              <div
                key={row.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                  padding: "6px 10px",
                  borderBottom: "1px solid #f5f5f5",
                }}
              >
                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                  <Space>
                    <Checkbox
                      checked={selectedKeys.includes(row.item.key)}
                      onChange={(event) =>
                        onToggleSelect(row.item.key, event.target.checked)
                      }
                    />
                    <Button size="small" type="link" onClick={() => onSelect(row.item.key)}>
                      {shortName}
                    </Button>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {row.item.key}
                    </Typography.Text>
                  </Space>
                  <Space>
                    <Tag>{row.item.keyType}</Tag>
                    <TtlBadge ttl={row.item.ttl} />
                  </Space>
                </Space>
              </div>
            );
          })}
        </div>
      </div>
      <Button onClick={onLoadMore} loading={loading}>
        Load More
      </Button>
    </Space>
  );
}
