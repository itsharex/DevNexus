import { Button, Card, Input, Modal, Popconfirm, Space, Tag, Tree, Typography, message } from "antd";
import type { DataNode } from "antd/es/tree";
import { useEffect, useMemo, useState } from "react";

import { useApiDebuggerStore } from "@/plugins/api-debugger/store/api-debugger";
import type { ApiCollection, ApiFolder, ApiSavedRequest } from "@/plugins/api-debugger/types";

function collectionKey(id: string) {
  return `collection:${id}`;
}

function folderKey(id: string) {
  return `folder:${id}`;
}

function requestKey(id: string) {
  return `request:${id}`;
}

function requestTitle(request: ApiSavedRequest, onOpen: (request: ApiSavedRequest) => void, onDelete: (id: string) => void) {
  return <Space size={6}>
    <Tag color="blue">{request.method}</Tag>
    <Button type="link" size="small" onClick={() => onOpen(request)}>{request.name}</Button>
    <Typography.Text type="secondary" ellipsis style={{ maxWidth: 520 }}>{request.url}</Typography.Text>
    <Popconfirm title="Delete request?" onConfirm={() => onDelete(request.id)}>
      <Button danger size="small">Delete</Button>
    </Popconfirm>
  </Space>;
}

function folderTitle(folder: ApiFolder, onNewSubfolder: (folder: ApiFolder) => void, onDelete: (id: string) => void) {
  return <Space size={6}>
    <Tag>Folder</Tag>
    <Typography.Text strong>{folder.name}</Typography.Text>
    <Button size="small" onClick={() => onNewSubfolder(folder)}>New Subfolder</Button>
    <Popconfirm title="Delete folder?" onConfirm={() => onDelete(folder.id)}>
      <Button size="small">Delete</Button>
    </Popconfirm>
  </Space>;
}

function collectionTitle(
  collection: ApiCollection,
  onNewFolder: (collection: ApiCollection) => void,
  onExport: (collection: ApiCollection) => void,
  onDelete: (id: string) => void,
) {
  return <Space size={6}>
    <Typography.Text strong>{collection.name}</Typography.Text>
    {collection.description ? <Typography.Text type="secondary">{collection.description}</Typography.Text> : null}
    <Button size="small" onClick={() => onNewFolder(collection)}>New Folder</Button>
    <Button size="small" onClick={() => onExport(collection)}>Export</Button>
    <Popconfirm title="Delete collection?" onConfirm={() => onDelete(collection.id)}>
      <Button danger size="small">Delete</Button>
    </Popconfirm>
  </Space>;
}

export function CollectionsView() {
  const collections = useApiDebuggerStore((state) => state.collections);
  const folders = useApiDebuggerStore((state) => state.folders);
  const requests = useApiDebuggerStore((state) => state.requests);
  const fetchAll = useApiDebuggerStore((state) => state.fetchAll);
  const saveCollection = useApiDebuggerStore((state) => state.saveCollection);
  const deleteCollection = useApiDebuggerStore((state) => state.deleteCollection);
  const saveFolder = useApiDebuggerStore((state) => state.saveFolder);
  const deleteFolder = useApiDebuggerStore((state) => state.deleteFolder);
  const deleteRequest = useApiDebuggerStore((state) => state.deleteRequest);
  const openSavedRequest = useApiDebuggerStore((state) => state.openSavedRequest);
  const exportCollection = useApiDebuggerStore((state) => state.exportCollection);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [folderModal, setFolderModal] = useState<{ open: boolean; collection?: ApiCollection; parentFolder?: ApiFolder; name: string }>({ open: false, name: "" });

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const createCollection = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      message.warning("Collection name is required");
      return;
    }
    setCreating(true);
    try {
      await saveCollection(trimmed);
      setName("");
      message.success("Collection saved");
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  };

  const createFolder = async () => {
    const trimmed = folderModal.name.trim();
    if (!folderModal.collection || !trimmed) {
      message.warning("Folder name is required");
      return;
    }
    try {
      await saveFolder(folderModal.collection.id, trimmed, folderModal.parentFolder?.id);
      message.success(`Folder saved in ${folderModal.parentFolder?.name ?? folderModal.collection.name}`);
      setFolderModal({ open: false, name: "" });
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const exportJson = async (collection: ApiCollection) => {
    try {
      const json = await exportCollection(collection.id, true);
      Modal.info({ title: `Export ${collection.name}`, content: <pre className="devnexus-api-code">{json}</pre>, width: 820 });
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const treeData = useMemo<DataNode[]>(() => {
    const buildFolderNodes = (collection: ApiCollection, parentId?: string | null): DataNode[] => folders
      .filter((folder) => folder.collectionId === collection.id && (folder.parentId ?? null) === (parentId ?? null))
      .map((folder) => ({
        key: folderKey(folder.id),
        title: folderTitle(folder, (item) => setFolderModal({ open: true, collection, parentFolder: item, name: "" }), deleteFolder),
        children: [
          ...buildFolderNodes(collection, folder.id),
          ...requests
            .filter((request) => request.folderId === folder.id)
            .map((request) => ({ key: requestKey(request.id), title: requestTitle(request, openSavedRequest, deleteRequest), isLeaf: true })),
        ],
      }));
    return collections.map((collection) => {
    const directRequests = requests.filter((request) => request.collectionId === collection.id && !request.folderId);
    return {
      key: collectionKey(collection.id),
      title: collectionTitle(collection, (item) => setFolderModal({ open: true, collection: item, name: "" }), exportJson, deleteCollection),
      children: [
        ...buildFolderNodes(collection),
        ...directRequests.map((request) => ({ key: requestKey(request.id), title: requestTitle(request, openSavedRequest, deleteRequest), isLeaf: true })),
      ],
    };
    });
  }, [collections, deleteCollection, deleteFolder, deleteRequest, exportCollection, folders, openSavedRequest, requests]);

  return <div style={{ height: "100%", overflow: "auto", paddingRight: 4 }}>
    <Card
      title="Collections"
      extra={<Space>
        <Input value={name} onPressEnter={createCollection} onChange={(event) => setName(event.target.value)} placeholder="New collection" />
        <Button type="primary" loading={creating} onClick={createCollection}>Create</Button>
      </Space>}
    >
      {treeData.length ? <Tree showLine defaultExpandAll treeData={treeData} /> : <Typography.Text type="secondary">No collections yet. Create one, then save requests into it from Workspace.</Typography.Text>}
    </Card>
    <Modal
      title={`New Folder${folderModal.parentFolder ? ` in ${folderModal.parentFolder.name}` : folderModal.collection ? ` in ${folderModal.collection.name}` : ""}`}
      open={folderModal.open}
      onCancel={() => setFolderModal({ open: false, name: "" })}
      onOk={createFolder}
      okText="Create"
    >
      <Input value={folderModal.name} onPressEnter={createFolder} onChange={(event) => setFolderModal((state) => ({ ...state, name: event.target.value }))} placeholder="Folder name" />
    </Modal>
  </div>;
}
