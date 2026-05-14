export type MqBrokerType = "rabbitmq" | "kafka";
export type MqTab = "connections" | "browser" | "studio" | "history";

export interface RabbitMqConfig {
  amqpUrl?: string;
  virtualHost?: string;
  managementUrl?: string;
  managementUsername?: string;
  managementPassword?: string;
}

export interface KafkaConfig {
  bootstrapServers?: string[];
  clientId?: string;
  securityProtocol?: string;
  saslMechanism?: string;
  saslUsername?: string;
  saslPassword?: string;
  tlsEnabled?: boolean;
}

export interface MqConnectionFormData {
  id?: string;
  name: string;
  groupName?: string;
  brokerType: MqBrokerType;
  hosts: string[];
  username?: string;
  password?: string;
  connectTimeout?: number;
  rabbitmq?: RabbitMqConfig;
  kafka?: KafkaConfig;
}

export interface MqConnectionInfo extends Omit<MqConnectionFormData, "password"> {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface MqDiagnosticStage { name: string; status: string; message: string }
export interface MqConnectionDiagnostics { brokerType: MqBrokerType; success: boolean; stages: MqDiagnosticStage[]; summary: string; durationMs: number }
export interface MqKeyValue { key: string; value: string; enabled: boolean; secret?: boolean }
export interface EncodedMessageBody { encoding: "utf8" | "base64"; text: string; contentType?: string; sizeBytes: number }

export interface MqPublishRequest {
  connId: string;
  brokerType: MqBrokerType;
  target: string;
  routingKey?: string;
  key?: string;
  partition?: number;
  headers: MqKeyValue[];
  properties: MqKeyValue[];
  body: EncodedMessageBody;
  saveHistory?: boolean;
}

export interface MqConsumeRequest {
  connId: string;
  brokerType: MqBrokerType;
  target: string;
  partition?: number;
  offsetMode?: "earliest" | "latest" | "specific";
  offset?: number;
  limit?: number;
  timeoutMs?: number;
  ackMode?: "requeue" | "ack";
  saveHistory?: boolean;
}

export interface MqMessagePreview {
  target: string;
  key?: EncodedMessageBody;
  body: EncodedMessageBody;
  headers: MqKeyValue[];
  properties: MqKeyValue[];
  partition?: number;
  offset?: number;
  timestamp?: string;
  redelivered?: boolean;
}

export interface MqOperationResult { status: string; summary: string; durationMs: number; messages: MqMessagePreview[]; error?: string }
export interface MqResourceNode { key: string; title: string; nodeType: string; brokerType: MqBrokerType; metadata: Record<string, unknown>; children: MqResourceNode[] }
export interface MqHistoryItem { id: string; brokerType: MqBrokerType; connectionId: string; operationType: string; target: string; status: string; durationMs: number; requestJson: string; resultJson: string; createdAt: string }
export interface MqHistoryFilter { brokerType?: MqBrokerType; connectionId?: string; target?: string; operationType?: string; status?: string; limit?: number }
export interface MqSavedMessage { id: string; brokerType: MqBrokerType; name: string; target?: string; body: EncodedMessageBody; headers: MqKeyValue[]; properties: MqKeyValue[]; createdAt: string; updatedAt: string }
export interface MqSavedMessageFormData { id?: string; brokerType: MqBrokerType; name: string; target?: string; body: EncodedMessageBody; headers: MqKeyValue[]; properties: MqKeyValue[] }
