import type { EncodedMessageBody, MqConnectionFormData, MqKeyValue } from "@/plugins/mq-client/types";

export function textBody(text = "", contentType = "application/json"): EncodedMessageBody {
  return { encoding: "utf8", text, contentType, sizeBytes: new TextEncoder().encode(text).length };
}

export function maskSensitivePairs(pairs: MqKeyValue[]): MqKeyValue[] {
  return pairs.map((item) => ({ ...item, value: item.secret || /password|authorization|cookie|token|secret|sasl|key/i.test(item.key) ? "******" : item.value }));
}

export function safeJson(value: string): string {
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

export function defaultMqConnection(brokerType: "rabbitmq" | "kafka" = "rabbitmq"): MqConnectionFormData {
  return brokerType === "rabbitmq"
    ? { name: "", brokerType, hosts: ["amqp://127.0.0.1:5672"], connectTimeout: 10, rabbitmq: { amqpUrl: "amqp://127.0.0.1:5672", virtualHost: "/", managementUrl: "http://127.0.0.1:15672" } }
    : { name: "", brokerType, hosts: ["127.0.0.1:9092"], connectTimeout: 10, kafka: { bootstrapServers: ["127.0.0.1:9092"], clientId: "devnexus-mq", securityProtocol: "PLAINTEXT", saslMechanism: "PLAIN" } };
}
