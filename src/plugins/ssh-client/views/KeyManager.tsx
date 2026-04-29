import { App, Button, Card, Input, Modal, Select, Space, Table, Typography } from "antd";
import { useEffect, useState } from "react";

import { useSshKeysStore } from "@/plugins/ssh-client/store/keys";
import { KeyImportForm } from "@/plugins/ssh-client/components/KeyImportForm";

export function KeyManager() {
  const { message } = App.useApp();
  const [importOpen, setImportOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateName, setGenerateName] = useState("rdmm-key");
  const [generateType, setGenerateType] = useState<"ed25519" | "rsa">("ed25519");

  const keys = useSshKeysStore((state) => state.keys);
  const loading = useSshKeysStore((state) => state.loading);
  const generated = useSshKeysStore((state) => state.generated);
  const fetchKeys = useSshKeysStore((state) => state.fetchKeys);
  const importKey = useSshKeysStore((state) => state.importKey);
  const deleteKey = useSshKeysStore((state) => state.deleteKey);
  const generateKey = useSshKeysStore((state) => state.generateKey);
  const getPublicKey = useSshKeysStore((state) => state.getPublicKey);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  return (
    <Card
      title="SSH Key Manager"
      extra={
        <Space>
          <Button onClick={() => setImportOpen(true)}>Import Key</Button>
          <Button type="primary" onClick={() => setGenerateOpen(true)}>
            Generate Key
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={keys}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: "Name", dataIndex: "name" },
          { title: "Type", dataIndex: "keyType", width: 120 },
          { title: "Path", dataIndex: "privateKeyPath" },
          { title: "Created", dataIndex: "createdAt", width: 220 },
          {
            title: "Actions",
            width: 220,
            render: (_, item) => (
              <Space>
                <Button
                  size="small"
                  onClick={() =>
                    void getPublicKey(item.id).then((text) => {
                      void navigator.clipboard.writeText(text);
                      message.success("Public key copied.");
                    })
                  }
                >
                  Copy Public
                </Button>
                <Button size="small" danger onClick={() => void deleteKey(item.id)}>
                  Delete
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <KeyImportForm
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSubmit={(payload) => {
          void importKey(payload.name, payload.privateKeyPath, payload.passphrase).then(() => {
            message.success("SSH key imported.");
            setImportOpen(false);
          });
        }}
      />

      <Modal
        title="Generate SSH Key"
        open={generateOpen}
        onCancel={() => setGenerateOpen(false)}
        onOk={() => {
          void generateKey(generateName, generateType).then(() => message.success("Key generated."));
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Typography.Text>Name</Typography.Text>
          <Input value={generateName} onChange={(event) => setGenerateName(event.target.value)} />
          <Typography.Text>Type</Typography.Text>
          <Select
            value={generateType}
            onChange={(value) => setGenerateType(value)}
            options={[
              { label: "Ed25519", value: "ed25519" },
              { label: "RSA", value: "rsa" },
            ]}
          />
          {generated ? (
            <>
              <Typography.Text strong>Public Key</Typography.Text>
              <Typography.Text code copyable>
                {generated.publicKey}
              </Typography.Text>
              <Typography.Text strong>Private Key</Typography.Text>
              <Typography.Text code copyable style={{ whiteSpace: "pre-wrap" }}>
                {generated.privateKeyPem}
              </Typography.Text>
            </>
          ) : null}
        </Space>
      </Modal>
    </Card>
  );
}
