import { Tag } from "antd";

interface TtlBadgeProps {
  ttl: number;
}

export function TtlBadge({ ttl }: TtlBadgeProps) {
  if (ttl < 0) {
    return <Tag color="blue">Persistent</Tag>;
  }

  if (ttl < 60) {
    return <Tag color="red">{ttl}s</Tag>;
  }

  return <Tag color="green">{ttl}s</Tag>;
}
