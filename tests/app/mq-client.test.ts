import { describe, expect, it } from "vitest";

import { defaultMqConnection, maskSensitivePairs, textBody } from "@/plugins/mq-client/utils/mq";

describe("mq client utilities", () => {
  it("creates RabbitMQ and Kafka default connection forms", () => {
    expect(defaultMqConnection("rabbitmq").rabbitmq?.managementUrl).toContain("15672");
    expect(defaultMqConnection("kafka").kafka?.bootstrapServers?.[0]).toContain("9092");
  });

  it("computes utf8 body size", () => {
    expect(textBody("hello").sizeBytes).toBe(5);
  });

  it("masks sensitive key value pairs", () => {
    const masked = maskSensitivePairs([{ key: "saslPassword", value: "secret", enabled: true }]);
    expect(masked[0].value).toBe("******");
  });
});
