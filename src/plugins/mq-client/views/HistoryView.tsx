import { Button, Card, Descriptions, Empty, Modal, Select, Space, Table, Tag } from "antd";
import { useEffect, useState } from "react";

import { useMqStore } from "@/plugins/mq-client/store/mq-client";
import type { MqHistoryItem } from "@/plugins/mq-client/types";
import { safeJson } from "@/plugins/mq-client/utils/mq";

export function HistoryView() {
  const [selected, setSelected] = useState<MqHistoryItem | null>(null);
  const [brokerType, setBrokerType] = useState<string | undefined>();
  const history = useMqStore((state) => state.history);
  const fetchHistory = useMqStore((state) => state.fetchHistory);
  const deleteHistory = useMqStore((state) => state.deleteHistory);
  const clearHistory = useMqStore((state) => state.clearHistory);
  const publish = useMqStore((state) => state.publish);

  useEffect(() => { void fetchHistory({ brokerType: brokerType as never, limit: 200 }); }, [brokerType, fetchHistory]);

  const replay = async (item: MqHistoryItem) => {
    if (item.operationType !== "publish") return;
    await publish(JSON.parse(item.requestJson));
  };

  return <Card title="MQ History" extra={<Space><Select allowClear placeholder="Broker" style={{ width: 140 }} value={brokerType} options={[{ label: "RabbitMQ", value: "rabbitmq" }, { label: "Kafka", value: "kafka" }]} onChange={setBrokerType} /><Button onClick={() => fetchHistory({ brokerType: brokerType as never })}>Refresh</Button><Button danger onClick={clearHistory}>Clear</Button></Space>}>
    {history.length === 0 ? <Empty /> : <Table rowKey="id" dataSource={history} pagination={{ pageSize: 10 }} columns={[
      { title: "Time", dataIndex: "createdAt" },
      { title: "Broker", dataIndex: "brokerType", render: (value: string) => <Tag>{value}</Tag> },
      { title: "Operation", dataIndex: "operationType" },
      { title: "Target", dataIndex: "target" },
      { title: "Status", dataIndex: "status", render: (value: string) => <Tag color={value === "success" ? "success" : "error"}>{value}</Tag> },
      { title: "Actions", render: (_: unknown, record: MqHistoryItem) => <Space><Button size="small" onClick={() => setSelected(record)}>Details</Button>{record.operationType === "publish" ? <Button size="small" onClick={() => replay(record)}>Replay</Button> : null}<Button danger size="small" onClick={() => deleteHistory(record.id)}>Delete</Button></Space> },
    ]} />}
    <Modal open={Boolean(selected)} title="History Detail" onCancel={() => setSelected(null)} footer={null} width={860}>
      {selected ? <><Descriptions column={2} bordered size="small" items={[{ key: "broker", label: "Broker", children: selected.brokerType }, { key: "op", label: "Operation", children: selected.operationType }, { key: "target", label: "Target", children: selected.target }, { key: "duration", label: "Duration", children: `${selected.durationMs} ms` }]} /><pre className="devnexus-api-preview">{safeJson(selected.requestJson)}</pre><pre className="devnexus-api-preview">{safeJson(selected.resultJson)}</pre></> : null}
    </Modal>
  </Card>;
}
