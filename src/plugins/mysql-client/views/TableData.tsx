import { Button, Card, Form, Input, message, Modal, Popconfirm, Space, Table, Typography } from "antd";
import { useMemo, useState } from "react";
import { useMysqlConnectionsStore } from "@/plugins/mysql-client/store/mysql-connections";

export function TableData() {
  const { activeDatabase, activeTable, columns, rowPage, loadRows, insertRow, updateRow, deleteRow } = useMysqlConnectionsStore();
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ type: "insert" | "edit"; row?: Record<string, unknown> } | null>(null);
  const [form] = Form.useForm<{ json: string }>();
  const pkColumns = columns.filter((item) => item.key === "PRI").map((item) => item.name);
  const readonly = pkColumns.length === 0;
  const tableColumns = useMemo(() => [...rowPage.columns.map((column) => ({ title: column, dataIndex: column, ellipsis: true, render: (value: unknown) => typeof value === "object" ? JSON.stringify(value) : String(value ?? "NULL") })), { title: "Actions", key: "actions", render: (_: unknown, row: Record<string, unknown>) => readonly ? <Typography.Text type="secondary">readonly</Typography.Text> : <Space><Button size="small" onClick={() => { setModal({ type: "edit", row }); form.setFieldsValue({ json: JSON.stringify(row, null, 2) }); }}>Edit</Button><Popconfirm title="Delete row?" onConfirm={async () => { const pk = Object.fromEntries(pkColumns.map((key) => [key, row[key]])); await deleteRow(JSON.stringify(pk)); message.success("Deleted"); }}><Button size="small" danger>Delete</Button></Popconfirm></Space> }], [deleteRow, form, pkColumns, readonly, rowPage.columns]);
  if (!activeDatabase || !activeTable) return <Card><Typography.Text>Select a table first.</Typography.Text></Card>;
  return <Card title={`${activeDatabase}.${activeTable}`} extra={<Space><Button onClick={() => loadRows((page - 1) * 100, 100)}>Refresh</Button><Button type="primary" onClick={() => { setModal({ type: "insert" }); form.setFieldsValue({ json: "{}" }); }}>Insert Row</Button></Space>} style={{ height: "100%", overflow: "auto" }}>
    {readonly ? <Typography.Paragraph type="secondary">This table has no primary key. Row edit/delete is disabled.</Typography.Paragraph> : null}
    <Table rowKey={(_, idx) => String(idx)} dataSource={rowPage.rows} columns={tableColumns} scroll={{ x: true }} pagination={{ current: page, pageSize: 100, total: rowPage.total, onChange: async (next) => { setPage(next); await loadRows((next - 1) * 100, 100); } }} />
    <Modal open={!!modal} title={modal?.type === "insert" ? "Insert Row" : "Edit Row"} onCancel={() => setModal(null)} onOk={async () => { const json = form.getFieldValue("json"); if (modal?.type === "insert") await insertRow(json); else if (modal?.row) { const pk = Object.fromEntries(pkColumns.map((key) => [key, modal.row?.[key]])); await updateRow(JSON.stringify(pk), json); } setModal(null); message.success("Saved"); }} width={760}>
      <Form form={form}><Form.Item name="json"><Input.TextArea rows={16} /></Form.Item></Form>
    </Modal>
  </Card>;
}
