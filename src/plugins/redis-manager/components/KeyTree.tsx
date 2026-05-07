import { useEffect, useMemo, useRef, useState } from "react";
import { App, Badge, Button, Checkbox, Dropdown, Input, Modal, Space, Tag, Typography } from "antd";
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
  onDelete: (key: string) => void;
  onRename: (key: string, nextKey: string) => void;
  onSetTtl: (key: string, ttl: number) => void;
}

export function KeyTree({
  keys,
  loading,
  selectedKeys,
  onToggleSelect,
  onSelect,
  onLoadMore,
  onSearch,
  onDelete,
  onRename,
  onSetTtl,
}: KeyTreeProps) {
  const { message } = App.useApp();
  const [searchText, setSearchText] = useState("");
  const rows = useMemo(() => {
    type Row =
      | { kind: "group"; key: string; label: string; count: number; depth: number }
      | { kind: "key"; key: string; item: KeyMeta; depth: number };
    const list: Row[] = [];
    const emittedGroups = new Set<string>();
    const groupCounts = new Map<string, number>();

    for (const item of keys) {
      const segments = item.key.split(":").filter(Boolean);
      const folders = segments.length > 1 ? segments.slice(0, -1) : ["(root)"];
      let path = "";
      for (const folder of folders) {
        path = path ? `${path}:${folder}` : folder;
        groupCounts.set(path, (groupCounts.get(path) ?? 0) + 1);
      }
    }

    const sorted = [...keys].sort((a, b) => a.key.localeCompare(b.key));
    for (const item of sorted) {
      const segments = item.key.split(":").filter(Boolean);
      const folders = segments.length > 1 ? segments.slice(0, -1) : ["(root)"];
      let path = "";
      folders.forEach((folder, index) => {
        path = path ? `${path}:${folder}` : folder;
        if (!emittedGroups.has(path)) {
          emittedGroups.add(path);
          list.push({
            kind: "group",
            key: `group-${path}`,
            label: folder,
            count: groupCounts.get(path) ?? 0,
            depth: index,
          });
        }
      });
      list.push({
        kind: "key",
        key: `key-${item.key}`,
        item,
        depth: folders[0] === "(root)" ? 0 : folders.length,
      });
    }
    return list;
  }, [keys]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      onSearch(searchText.trim() || "*");
    }, 300);
    return () => window.clearTimeout(handle);
  }, [onSearch, searchText]);

  const promptForTtl = (key: string) => {
    let value = "60";
    Modal.confirm({
      title: "Set TTL",
      content: (
        <Input
          defaultValue={value}
          placeholder="Seconds"
          onChange={(event) => {
            value = event.target.value;
          }}
        />
      ),
      onOk: () => {
        const ttl = Number(value);
        if (!Number.isFinite(ttl) || ttl <= 0) {
          message.error("Invalid TTL");
          return Promise.reject();
        }
        onSetTtl(key, ttl);
        return Promise.resolve();
      },
    });
  };

  const promptForRename = (key: string) => {
    let value = key;
    Modal.confirm({
      title: "Rename Key",
      content: (
        <Input
          defaultValue={value}
          onChange={(event) => {
            value = event.target.value;
          }}
        />
      ),
      onOk: () => {
        const next = value.trim();
        if (!next || next === key) {
          return Promise.resolve();
        }
        onRename(key, next);
        return Promise.resolve();
      },
    });
  };

  const copyKey = (key: string) => {
    void navigator.clipboard
      ?.writeText(key)
      .then(() => message.success("Key copied"))
      .catch(() => message.error("Copy failed"));
  };

  const confirmDelete = (key: string) => {
    Modal.confirm({
      title: "Delete key?",
      content: key,
      okButtonProps: { danger: true },
      onOk: () => {
        onDelete(key);
      },
    });
  };

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
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
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
                    paddingLeft: 10 + row.depth * 18,
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
              <Dropdown
                key={row.key}
                trigger={["contextMenu"]}
                menu={{
                  items: [
                    { key: "copy", label: "Copy Key", onClick: () => copyKey(row.item.key) },
                    { key: "detail", label: "View Detail", onClick: () => onSelect(row.item.key) },
                    { key: "ttl", label: "Set TTL", onClick: () => promptForTtl(row.item.key) },
                    { key: "rename", label: "Rename", onClick: () => promptForRename(row.item.key) },
                    { key: "delete", label: "Delete", danger: true, onClick: () => confirmDelete(row.item.key) },
                  ],
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                    padding: "6px 10px",
                    paddingLeft: 10 + row.depth * 18,
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
              </Dropdown>
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
