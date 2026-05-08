# RDMM - Windows 常用工具包开发计划

> rdmm = Redis & Dev Manager  
> 定位：插件化 Windows 桌面工具箱，第一期实现 Redis 管理工具

---

## 技术选型

| 层次 | 方案 | 说明 |
|------|------|------|
| 桌面框架 | Tauri 2 | Rust 后端 + WebView 前端，安装包体积小（~5MB） |
| 前端框架 | React 18 + TypeScript | |
| UI 组件库 | Ant Design 5 | 管理后台风格，组件完整 |
| 状态管理 | Zustand | 轻量，按插件切片隔离 |
| 图表 | ECharts | 服务器监控图表 |
| 终端组件 | xterm.js | 内嵌命令控制台 |
| 虚拟列表 | @tanstack/react-virtual | 百万级 Key 列表不卡顿 |
| Redis 客户端 | redis-rs（Rust） | 支持单机/哨兵/集群 |
| 本地存储 | SQLite via rusqlite | 连接配置、历史记录 |
| 密码加密 | AES-256-GCM（Rust aes-gcm） | 加密存储连接密码 |
| 打包 | Tauri Bundler | 输出 .msi / .exe |
| 自动更新 | Tauri updater 插件 | |

---

## 整体架构

```
┌─────────────────────────────────────────────────────┐
│                   主应用 Shell                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  插件注册表  │  │  导航/布局   │  │  主题/设置 │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
└────────────────────────┬────────────────────────────┘
                         │ PluginManifest 接口
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  ┌───────────┐   ┌───────────┐   ┌───────────┐
  │  Redis    │   │ (SSH Tool)│   │(HTTP Tool)│
  │  Manager  │   │  预留      │   │  预留      │
  └───────────┘   └───────────┘   └───────────┘
        │
  ┌─────┴──────────────────────┐
  │        Rust 后端            │
  │  redis-rs │ SQLite │ 系统API│
  └────────────────────────────┘
```

---

## 目录结构

```
rdmm/
├── src/
│   ├── main.tsx                    # 应用入口
│   ├── app/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx        # 主窗口布局
│   │   │   ├── Sidebar.tsx         # 左侧插件导航
│   │   │   └── Titlebar.tsx        # 自定义标题栏
│   │   ├── plugin-registry/
│   │   │   ├── registry.ts         # 插件注册表
│   │   │   ├── PluginRouter.tsx    # 插件路由渲染
│   │   │   └── types.ts            # PluginManifest 类型定义
│   │   └── store/
│   │       ├── theme.ts            # 主题状态
│   │       └── settings.ts         # 全局设置状态
│   └── plugins/
│       └── redis-manager/
│           ├── index.tsx           # 插件入口（导出 manifest）
│           ├── store/
│           │   ├── connections.ts  # 连接列表状态
│           │   └── workspace.ts    # 当前工作区状态（选中连接/DB/Key）
│           ├── views/
│           │   ├── ConnectionList.tsx
│           │   ├── KeyBrowser.tsx
│           │   ├── Console.tsx
│           │   └── ServerInfo.tsx
│           └── components/
│               ├── editors/
│               │   ├── StringEditor.tsx
│               │   ├── HashEditor.tsx
│               │   ├── ListEditor.tsx
│               │   ├── SetEditor.tsx
│               │   └── ZSetEditor.tsx
│               ├── KeyTree.tsx
│               ├── ConnectionForm.tsx
│               └── TtlBadge.tsx
├── src-tauri/
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       ├── db/
│       │   ├── mod.rs
│       │   ├── init.rs             # 建表、迁移
│       │   └── connection_repo.rs  # 连接配置 CRUD
│       ├── crypto/
│       │   └── mod.rs              # AES-256-GCM 加解密
│       └── plugins/
│           └── redis/
│               ├── mod.rs
│               ├── pool.rs         # 连接池管理
│               ├── commands.rs     # Tauri Command 暴露层
│               └── types.rs        # 数据结构定义
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── PLAN.md
└── CLAUDE.md
```

---

## Phase 0：项目脚手架

### 0.1 初始化工程
- [x] 执行 `npm create tauri-app@latest` 创建项目，选择 React + TypeScript 模板
- [x] 配置 `vite.config.ts`：路径别名（`@/` → `src/`）
- [x] 安装前端依赖：`antd`、`zustand`、`@tanstack/react-virtual`、`echarts`、`xterm`
- [x] 安装 Rust 依赖到 `Cargo.toml`：`redis`、`rusqlite`、`aes-gcm`、`tokio`、`serde`、`uuid`
- [x] 配置 `tauri.conf.json`：窗口大小 1280×800，最小 960×600，decorations: false（使用自定义标题栏）

### 0.2 自定义标题栏
- [x] 创建 `Titlebar.tsx`：实现拖拽区域、最小化/最大化/关闭按钮
- [x] 调用 Tauri window API（`appWindow.minimize/maximize/close`）
- [x] CSS 设置 `data-tauri-drag-region` 拖拽区域

### 0.3 主窗口布局
- [x] 创建 `AppShell.tsx`：左侧固定宽度导航栏（64px 图标模式 / 200px 展开模式） + 右侧内容区
- [x] 导航栏支持折叠/展开，状态持久化到 localStorage
- [x] 底部状态栏：显示当前连接名称、Redis 版本、延迟

### 0.4 插件注册系统
- [x] 定义 `PluginManifest` 接口：`{ id, name, icon, version, component, sidebarOrder }`
- [x] 创建 `registry.ts`：维护插件列表，提供 `register(plugin)` / `getAll()` 方法
- [x] 创建 `PluginRouter.tsx`：根据当前选中插件 id 渲染对应组件
- [x] 在 `main.tsx` 中导入并注册所有插件

### 0.5 全局主题
- [x] Zustand `theme.ts`：`mode: 'light' | 'dark'`，持久化到 localStorage
- [x] Ant Design `ConfigProvider` 包裹根组件，动态切换 `theme.darkAlgorithm`
- [x] 标题栏/侧边栏适配暗色模式 CSS 变量

### 0.6 SQLite 初始化
- [x] Rust `db/init.rs`：应用启动时在数据目录创建 `rdmm.db`
- [x] 建表 `connections`（id, name, group_name, host, port, password_encrypted, db_index, connection_type, created_at）
- [x] 建表 `query_history`（id, connection_id, command, executed_at）
- [x] Tauri 启动钩子中调用 `db::init::run()`

---

## Phase 1：连接管理

### 1.1 Rust 后端 - 连接池
- [x] `pool.rs`：使用 `HashMap<String, redis::Client>` 按连接 id 缓存 Client
- [x] 实现 `connect(id, config)` → 测试连通性，成功后存入池
- [x] 实现 `disconnect(id)` → 从池中移除
- [x] 实现 `get_client(id)` → 返回可用连接，失败时返回错误
- [x] 支持连接类型枚举：`Standalone` / `Sentinel` / `Cluster`（Sentinel 和 Cluster 第一期结构预留，仅实现 Standalone）

### 1.2 Rust 后端 - 加密模块
- [x] `crypto/mod.rs`：使用 `aes-gcm` crate 实现 `encrypt(plaintext) -> String`
- [x] 实现 `decrypt(ciphertext) -> String`
- [x] 密钥从系统环境或固定派生（应用安装时生成，存入 Tauri 应用数据目录）

### 1.3 Rust 后端 - CRUD Commands
- [x] `connection_repo.rs`：实现 `list_connections()`、`save_connection()`、`delete_connection()`、`get_connection(id)`
- [x] `commands.rs` 暴露 Tauri Command：
  - [x] `cmd_list_connections() -> Vec<ConnectionInfo>`
  - [x] `cmd_save_connection(form: ConnectionForm) -> Result<String>` （返回 id）
  - [x] `cmd_delete_connection(id: String) -> Result<()>`
  - [x] `cmd_test_connection(form: ConnectionForm) -> Result<Latency>`
  - [x] `cmd_connect(id: String) -> Result<RedisServerInfo>` （连接并返回服务器信息）
  - [x] `cmd_disconnect(id: String) -> Result<()>`

### 1.4 前端 - 连接列表页
- [x] `ConnectionList.tsx`：左侧主视图，展示分组的连接卡片列表
- [x] 每个连接卡片显示：连接名、host:port、连接状态指示灯（灰/绿/红）
- [x] 工具栏：新建连接按钮、搜索框（按名称过滤）
- [x] 右键菜单：连接、编辑、复制、删除

### 1.5 前端 - 连接表单
- [x] `ConnectionForm.tsx`：Ant Design Modal + Form
- [x] 字段：名称、分组、主机、端口（默认 6379）、密码（明文输入，保存时加密）、数据库索引（0-15 下拉）、连接类型
- [x] "测试连接"按钮：调用 `cmd_test_connection`，展示延迟或错误信息
- [x] 表单校验：host 必填，port 范围 1-65535

### 1.6 前端 - 连接状态管理
- [x] Zustand `connections.ts`：存储连接列表、已连接 id 集合
- [x] 操作：`fetchConnections()`、`addConnection()`、`removeConnection()`、`setConnected(id)`
- [x] 连接成功后自动跳转到 Key 浏览器视图

---

## Phase 2：Key 浏览器

### 2.1 Rust 后端 - Key 扫描
- [x] `cmd_scan_keys(conn_id, pattern, cursor, count) -> ScanResult`：封装 SCAN 命令，返回 `{ next_cursor, keys: Vec<KeyMeta> }`
- [x] `KeyMeta` 包含：`key`、`type`（string/hash/list/set/zset）、`ttl`
- [x] 每次 SCAN count=200，前端控制分批加载

### 2.2 Rust 后端 - Key 操作
- [x] `cmd_get_key_type(conn_id, key) -> KeyType`
- [x] `cmd_get_ttl(conn_id, key) -> i64`（-1 永不过期，-2 不存在）
- [x] `cmd_set_ttl(conn_id, key, ttl_seconds) -> Result<()>`
- [x] `cmd_delete_keys(conn_id, keys: Vec<String>) -> Result<u64>`（返回删除数量）
- [x] `cmd_rename_key(conn_id, old_key, new_key) -> Result<()>`
- [x] `cmd_key_exists(conn_id, key) -> bool`

### 2.3 Rust 后端 - String 类型
- [x] `cmd_get_string(conn_id, key) -> String`
- [x] `cmd_set_string(conn_id, key, value, ttl?) -> Result<()>`

### 2.4 Rust 后端 - Hash 类型
- [x] `cmd_hgetall(conn_id, key) -> Vec<HashField>`（`{ field, value }`）
- [x] `cmd_hset(conn_id, key, field, value) -> Result<()>`
- [x] `cmd_hdel(conn_id, key, field) -> Result<()>`

### 2.5 Rust 后端 - List 类型
- [x] `cmd_lrange(conn_id, key, start, stop) -> Vec<String>`
- [x] `cmd_llen(conn_id, key) -> i64`
- [x] `cmd_lset(conn_id, key, index, value) -> Result<()>`
- [x] `cmd_lpush/rpush(conn_id, key, value) -> Result<()>`
- [x] `cmd_lrem(conn_id, key, count, value) -> Result<()>`

### 2.6 Rust 后端 - Set 类型
- [x] `cmd_smembers(conn_id, key) -> Vec<String>`（数量大时用 SSCAN）
- [x] `cmd_sadd(conn_id, key, member) -> Result<()>`
- [x] `cmd_srem(conn_id, key, member) -> Result<()>`

### 2.7 Rust 后端 - ZSet 类型
- [x] `cmd_zrange_withscores(conn_id, key, start, stop) -> Vec<ZMember>`（`{ member, score }`）
- [x] `cmd_zcard(conn_id, key) -> i64`
- [x] `cmd_zadd(conn_id, key, score, member) -> Result<()>`
- [x] `cmd_zrem(conn_id, key, member) -> Result<()>`
- [x] `cmd_zscore(conn_id, key, member) -> Option<f64>`

### 2.8 前端 - Key 树组件
- [x] `KeyTree.tsx`：按 `:` 分隔符将 Key 解析为树形结构（如 `user:1:name` → user > 1 > name）
- [x] 使用 `@tanstack/react-virtual` 虚拟渲染，支持 10 万+ Key 不卡顿
- [x] 树节点显示：Key 名、类型图标（颜色区分）、TTL 角标（快过期时红色警示）
- [x] 顶部搜索框：输入 pattern 触发 SCAN（防抖 300ms）
- [x] 支持"加载更多"按钮（cursor 分页）
- [x] 右键菜单：复制 Key 名、查看详情、设置 TTL、删除、重命名

### 2.9 前端 - Key 详情面板
- [x] 右侧面板布局：Key 名（可点击编辑重命名）、类型标签、TTL 显示与编辑、数据编辑区
- [x] 根据 Key 类型动态渲染对应 Editor 组件

### 2.10 前端 - StringEditor
- [x] 显示字符串值，自动检测 JSON 并提供格式化按钮
- [x] 编辑模式：textarea 输入，保存调用 `cmd_set_string`
- [x] 显示字节大小

### 2.11 前端 - HashEditor
- [x] Ant Design Table：field / value 两列
- [x] 支持行内编辑（点击 value 单元格进入编辑状态）
- [x] 工具栏：添加字段按钮、搜索字段输入框
- [x] 每行右侧删除按钮

### 2.12 前端 - ListEditor
- [x] 有序列表，显示 index / value 两列
- [x] 分页（每页 100 条），调用 LRANGE
- [x] 支持修改指定 index 的值（LSET）
- [x] 顶部操作：LPUSH / RPUSH 添加元素，选中行后删除（LREM）

### 2.13 前端 - SetEditor
- [x] 成员列表（单列），显示成员数量
- [x] 搜索框（前端过滤）
- [x] 添加成员（SADD）、勾选删除（SREM）

### 2.14 前端 - ZSetEditor
- [x] 表格：member / score 两列，默认按 score 升序
- [x] 支持修改 score（ZADD 覆盖）
- [x] 添加成员（member + score）
- [x] 按 score 范围筛选（调用 ZRANGEBYSCORE）

### 2.15 前端 - 批量操作
- [x] Key 列表支持多选（Checkbox）
- [x] 批量删除：选中后弹确认框，调用 `cmd_delete_keys`
- [x] 批量设置 TTL：输入秒数，批量执行 EXPIRE

---

## Phase 3：命令控制台

### 3.1 Rust 后端 - 命令执行
- [x] `cmd_execute_raw(conn_id, command: String) -> Result<RedisValue>`
- [x] `RedisValue` 枚举：`Nil / Int / Bulk / Array / Error`，序列化为前端可渲染结构
- [x] 命令历史写入 SQLite `query_history` 表
- [x] 禁止执行危险命令白名单（`FLUSHALL`/`FLUSHDB`/`CONFIG SET`/`SHUTDOWN` 需二次确认）

### 3.2 前端 - 控制台界面
- [x] `Console.tsx`：使用 xterm.js 渲染终端
- [x] 顶部选择当前连接和 DB index
- [x] 输入区支持上下键翻历史命令
- [x] 命令自动补全（常用命令关键字提示）
- [x] 输出结果格式化：Array 类型按行缩进显示，Error 红色显示
- [x] 历史记录面板（侧边抽屉）：查看、一键重新执行历史命令

---

## Phase 4：服务器信息监控

### 4.1 Rust 后端 - INFO 解析
- [x] `cmd_get_server_info(conn_id) -> ServerInfo`：执行 `INFO all`，解析为结构化数据
- [x] `ServerInfo` 包含：`server`（版本、模式、OS）、`clients`（连接数）、`memory`（used_memory、peak）、`stats`（命中率、ops/sec）、`replication`（角色、从库数）
- [x] `cmd_get_slowlog(conn_id, count) -> Vec<SlowlogEntry>`
- [x] `cmd_get_dbsize(conn_id) -> HashMap<u8, u64>`（各 DB 的 key 数量）

### 4.2 前端 - 服务器信息页
- [x] `ServerInfo.tsx`：顶部 4 个关键指标卡（内存使用、连接数、命令/秒、缓存命中率）
- [x] 内存使用折线图（每 5 秒轮询一次，保留最近 60 个点）：用 ECharts 渲染
- [x] 命令执行速率折线图
- [x] 数据库 Key 数量柱状图（按 DB 分组）
- [x] 服务器基本信息表格（版本、启动时间、角色等）
- [x] 慢查询日志表格：执行时间（微秒）、命令、发生时间

---

## Phase 5：数据导入导出

### 5.1 Rust 后端 - 导出
- [x] `cmd_export_keys(conn_id, keys: Vec<String>, format: ExportFormat) -> Result<String>`
- [x] `ExportFormat` 枚举：`Json` / `Csv`
- [x] JSON 格式：`[{ "key": "...", "type": "...", "ttl": 100, "value": ... }]`
- [x] CSV 格式：key, type, ttl, value（Hash/List/Set/ZSet 序列化为 JSON 字符串放 value 列）
- [ ] 调用系统文件保存对话框（`tauri::dialog::save`）写入文件

### 5.2 Rust 后端 - 导入
- [x] `cmd_import_keys(conn_id, file_path: String) -> Result<ImportResult>`
- [x] `ImportResult`：`{ success_count, failed_count, errors: Vec<String> }`
- [x] 解析 JSON 文件，逐条写入 Redis（根据 type 选择对应命令）
- [x] 支持 TTL 恢复（EXPIRE）

### 5.3 前端 - 导入导出 UI
- [x] Key 列表工具栏增加"导出"按钮：导出当前选中或当前 pattern 匹配的所有 Key
- [x] 导出格式选择下拉（JSON / CSV）
- [ ] "导入"按钮：打开文件选择对话框，选择后展示预览（前 10 条），确认后执行导入
- [x] 导入结果 Modal：显示成功/失败数量，失败条目可展开查看

---

## Phase 6：打包与发布

### 6.1 自动更新
- [ ] 配置 Tauri updater：指定更新检查 URL（GitHub Releases JSON）
- [ ] 应用启动时静默检查更新，有新版本时显示通知 Banner
- [ ] 点击 Banner 展示更新日志，确认后下载安装

### 6.2 打包配置
- [ ] `tauri.conf.json` 配置应用图标（各尺寸 .ico / .png）
- [ ] 配置安装包元数据：应用名、版本、作者、描述
- [ ] 配置 Windows .msi：安装路径、开机自启选项（可选）
- [ ] 运行 `npm run tauri build` 生成 `.msi` 和 `.exe` 两种安装包

### 6.3 发布
- [ ] 创建 GitHub 仓库，配置 GitHub Actions CI/CD
- [ ] CI 触发条件：推送 `v*` tag
- [ ] CI 流程：安装 Rust + Node → 构建 → 上传 Release Assets
- [ ] 编写 Release Notes 模板

---

## 风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| 百万 Key 列表渲染卡顿 | 高 | 虚拟列表 + SCAN 分批（每批 200），不一次性加载全部 |
| Redis 连接断开无感知 | 中 | 心跳检测（每 30s PING），断线自动重连 3 次 |
| 大 Value（>1MB）导致界面卡死 | 中 | 超过 100KB 只显示预览，提供"加载完整内容"按钮 |
| 密码明文泄露 | 低 | AES-256-GCM 加密存 SQLite，密钥不离开本机 |
| Tauri WebView 平台差异 | 低 | 锁定 Windows 使用 WebView2，统一行为 |

---

## 开发顺序总览

```
Week 1:  Phase 0  - 脚手架、布局、插件系统、SQLite
Week 2:  Phase 1  - 连接管理（后端池 + 前端表单 + CRUD）
Week 3:  Phase 2上 - Key 浏览器（SCAN + Key 树 + 基本操作）
Week 4:  Phase 2下 - 5 种数据类型 Editor
Week 5:  Phase 3+4 - 命令控制台 + 服务器监控
Week 6:  Phase 5+6 - 导入导出 + 打包发布
Week 7:  Phase 7  - SSH 插件脚手架 + 连接管理
Week 8:  Phase 8  - SSH 终端（多标签 + xterm.js）
Week 9:  Phase 9  - SFTP 文件管理器（已下线）
Week 10: Phase 10 - SSH 密钥管理
Week 11: Phase 11 - 端口转发
Week 12: Phase 12 - 快捷指令 + 会话录制 + 打包更新
Week 13: Phase 13 - S3 插件脚手架 + 连接管理
Week 14: Phase 14 - Bucket 浏览器
Week 15: Phase 15 - 对象浏览器（列表、导航、基本操作）
Week 16: Phase 16 - 上传下载与进度管理
Week 17: Phase 17 - 对象预览 + 预签名 URL
Week 18: Phase 18 - 高级功能（版本管理、生命周期、存储桶策略）
Week 19: Phase 19 - 打包更新（第三期）
```

---

# 第二期：SSH 客户端插件

> 目标：在现有插件体系内新增 `ssh-client` 插件，提供多标签 SSH 终端、本地密钥管理、端口转发能力（SFTP 功能已按当前产品决策下线）。

---

## 第二期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| SSH 协议实现 | `russh` 0.44（纯 Rust） | 原生 async/await，与 Tokio 无缝集成，无 C 依赖，Windows 友好 |
| 终端解析 | `xterm.js`（已有） + `@xterm/addon-fit` `@xterm/addon-web-links` | 自适应尺寸、链接可点击 |
| 文件图标 | `react-file-icon` | SFTP 文件列表文件类型图标 |
| 分割面板 | `allotment` | 拖拽调整终端/文件面板比例 |
| 密钥格式 | `ssh-key` crate | 解析/生成 OpenSSH、PEM、PKCS#8 格式密钥 |

---

## 第二期目录结构增量

```
src/
└── plugins/
    └── ssh-client/
        ├── index.tsx                   # 插件入口（注册 manifest）
        ├── store/
        │   ├── ssh-connections.ts      # SSH 连接列表状态
        │   ├── sessions.ts             # 活跃终端会话状态（多标签）
        │   └── tunnels.ts              # 端口转发规则状态
        ├── views/
        │   ├── SshConnectionList.tsx   # 连接管理主页
        │   ├── TerminalWorkspace.tsx   # 多标签终端工作区
        │   ├── KeyManager.tsx          # SSH 密钥管理
        │   └── TunnelManager.tsx       # 端口转发管理
        └── components/
            ├── SshConnectionForm.tsx   # 新建/编辑连接表单
            ├── TerminalTab.tsx         # 单个终端标签
            ├── KeyImportForm.tsx       # 导入密钥表单
            ├── TunnelRuleForm.tsx      # 端口转发规则表单
            └── QuickCommandPanel.tsx   # 快捷指令面板（侧边抽屉）

src-tauri/src/
└── plugins/
    └── ssh/
        ├── mod.rs
        ├── session_pool.rs             # SSH 会话池（按连接 id 管理）
        ├── terminal.rs                 # PTY 会话创建与 I/O 转发
        ├── tunnel.rs                   # 端口转发（本地/远程）
        ├── key_store.rs                # SSH 密钥文件读取与解密
        └── commands.rs                 # 所有 Tauri Command 暴露层
```

---

## Phase 7：SSH 插件脚手架与连接管理

### 7.1 SQLite 扩展
- [x] `db/init.rs` 新增建表 `ssh_connections`：
  - 字段：`id`（UUID）、`name`、`group_name`、`host`、`port`（默认 22）、`username`、`auth_type`（`password` / `key` / `key_password`）、`password_encrypted`、`key_id`（外键 `ssh_keys.id`，可空）、`key_passphrase_encrypted`、`jump_host_id`（跳板机，可空，自引用）、`encoding`（默认 `utf-8`）、`keepalive_interval`（默认 30s）、`created_at`
- [x] 新增建表 `ssh_keys`：
  - 字段：`id`（UUID）、`name`、`type`（`rsa` / `ed25519` / `ecdsa`）、`private_key_path`、`public_key`（文本存储）、`created_at`
- [x] 新增建表 `ssh_quick_commands`：
  - 字段：`id`、`connection_id`（可空，空表示全局）、`name`、`command`、`sort_order`
- [x] 新增建表 `port_forward_rules`：
  - 字段：`id`、`connection_id`、`name`、`type`（`local` / `remote` / `dynamic`）、`local_host`、`local_port`、`remote_host`、`remote_port`、`auto_start`（bool）、`status`（`stopped` / `running` / `error`）

### 7.2 Rust 后端 - 连接 CRUD
- [x] `db/ssh_connection_repo.rs`：实现 `list_ssh_connections()`、`save_ssh_connection()`、`delete_ssh_connection()`、`get_ssh_connection(id)`
- [x] `commands.rs` 暴露：
  - [x] `cmd_ssh_list_connections() -> Vec<SshConnectionInfo>`
  - [x] `cmd_ssh_save_connection(form: SshConnectionForm) -> Result<String>`（返回 id，密码/密钥口令字段加密后存储）
  - [x] `cmd_ssh_delete_connection(id: String) -> Result<()>`
  - [x] `cmd_ssh_test_connection(form: SshConnectionForm) -> Result<u64>`（返回握手耗时毫秒）

### 7.3 Rust 后端 - SSH 会话池
- [x] `session_pool.rs`：使用 `Arc<Mutex<HashMap<String, SshSessionHandle>>>` 管理活跃会话
- [x] `SshSessionHandle`：包含 russh `Handle`、连接配置快照、最后活跃时间
- [x] 实现 `open_session(conn_id, config) -> Result<()>`：建立 SSH 握手，支持密码认证和公钥认证两种路径
- [x] 实现 `close_session(conn_id)`：发送 SSH disconnect，从池中移除
- [x] 实现 `get_session(conn_id) -> Result<SshSessionHandle>`：若不存在则返回错误
- [x] 心跳 keepalive：每隔 `keepalive_interval` 秒发送 SSH keepalive 包，断开时标记状态为 `disconnected`
- [x] 重连策略：自动重试 3 次，间隔 2s/4s/8s 指数退避

### 7.4 前端 - 连接列表页
- [x] `SshConnectionList.tsx`：左侧主视图，展示分组的 SSH 连接列表
- [x] 每个连接条目显示：连接名、`user@host:port`、认证类型图标（密码锁/密钥图标）、连接状态点（灰/绿/红）
- [x] 工具栏：新建连接、搜索框（按名称/主机过滤）
- [x] 右键菜单：连接（开启终端）、在新标签打开、编辑、复制配置、删除
- [ ] 支持拖拽排序分组

### 7.5 前端 - 连接表单
- [x] `SshConnectionForm.tsx`：Ant Design Modal + Form（Tabs 分两栏：基本 / 高级）
- [x] 基本标签字段：名称、分组、主机、端口、用户名、认证方式（单选：密码 / 密钥 / 密钥+口令）
- [x] 认证方式为"密码"时：显示密码输入框
- [x] 认证方式为"密钥"或"密钥+口令"时：下拉选择已存密钥，或点击"导入新密钥"
- [x] 高级标签字段：跳板机（下拉选择已有连接）、编码（默认 UTF-8）、Keepalive 间隔（秒）、服务器存活检测超时
- [x] "测试连接"按钮：调用 `cmd_ssh_test_connection`，显示"握手成功，耗时 XXms"或错误详情
- [x] 表单校验：host/port/username 必填，port 范围 1-65535

### 7.6 前端 - 连接状态管理
- [x] Zustand `ssh-connections.ts`：`connections[]`、`connectedIds: Set<string>`
- [x] 操作：`fetchConnections()`、`upsertConnection()`、`removeConnection()`、`markConnected(id)`、`markDisconnected(id)`
- [x] 监听后端 Tauri 事件 `ssh://session-closed`，自动更新状态点为红色

---

## Phase 8：多标签 SSH 终端

### 8.1 Rust 后端 - PTY 会话
- [x] `terminal.rs`：定义 `TerminalSession` 结构体，包含 `channel`（russh Channel）、`session_id`（UUID）、`conn_id`
- [x] `cmd_ssh_open_terminal(conn_id: String) -> Result<String>`：在已连接会话上请求 PTY（`xterm`，初始 80×24），返回 `session_id`
- [x] `cmd_ssh_terminal_input(session_id: String, data: Vec<u8>) -> Result<()>`：将前端输入字节流写入 channel stdin
- [x] `cmd_ssh_terminal_resize(session_id: String, cols: u16, rows: u16) -> Result<()>`：发送 `window-change` 请求
- [x] `cmd_ssh_close_terminal(session_id: String) -> Result<()>`：关闭 channel
- [x] 后端输出推送：channel stdout/stderr 数据通过 Tauri 事件 `ssh://terminal-output/{session_id}` 推送到前端（`Vec<u8>` 序列化为 base64）
- [x] 会话结束推送：channel 关闭时发送 `ssh://terminal-exit/{session_id}`，携带退出码

### 8.2 前端 - 终端工作区
- [x] `TerminalWorkspace.tsx`：顶部多标签 Tab Bar + 下方终端内容区
- [x] Tab Bar：每个标签显示"连接名 #序号"、关闭按钮；右键菜单：重命名标签、复制会话、关闭其他标签
- [ ] 支持拖拽标签排序
- [x] 新建标签：点击"+"按钮，弹出连接选择器（展示已配置连接列表），选中后调用 `cmd_ssh_open_terminal`

### 8.3 前端 - 单终端标签
- [x] `TerminalTab.tsx`：封装 xterm.js Terminal 实例
- [x] 加载 `@xterm/addon-fit`：窗口/面板尺寸变化时自动 resize，触发 `cmd_ssh_terminal_resize`
- [x] 加载 `@xterm/addon-web-links`：终端内 URL 可点击
- [ ] 加载 `@xterm/addon-search`：Ctrl+F 触发文本搜索框
- [x] 监听 Tauri 事件 `ssh://terminal-output/{session_id}`，将 base64 decode 后写入 xterm
- [x] 监听 `ssh://terminal-exit/{session_id}`，在终端显示"[会话已结束，退出码: X]"灰色提示
- [x] 键盘输入：`terminal.onData` 回调调用 `cmd_ssh_terminal_input`
- [ ] 右键菜单：复制选中文本、粘贴、清屏、显示快捷指令面板

### 8.4 前端 - 快捷指令面板
- [x] `QuickCommandPanel.tsx`：侧边抽屉（Ant Design Drawer）
- [x] 展示当前连接的专属快捷指令 + 全局快捷指令（分组显示）
- [x] 点击指令：直接发送到当前活跃终端（调用 `cmd_ssh_terminal_input`，末尾追加 `\n`）
- [x] 支持新增/编辑/删除指令，持久化到 `ssh_quick_commands` 表
- [ ] 支持指令搜索（前端过滤）

### 8.5 前端 - 状态管理
- [x] Zustand `sessions.ts`：`sessions: Map<sessionId, SessionMeta>`（含 `connId`、`tabLabel`、`status: 'connecting'|'active'|'closed'`）
- [x] 操作：`openSession()`、`closeSession()`、`renameSession()`、`setActive(sessionId)`
- [x] `activeSessionId: string | null`：当前聚焦标签

---

## Phase 9：SFTP 文件管理器（已下线）

- [x] 2026-04-28 按产品决策移除 SFTP 功能，避免继续投入维护成本：
  - 前端移除 SFTP Tab/视图/状态与组件（`SftpExplorer`、`store/sftp.ts`、`SftpFileList`、`SftpToolbar`）。
  - 后端移除 SFTP command 注册与导出，移除 `plugins/ssh/sftp.rs` 模块。
  - 类型定义中清理 SFTP 相关结构（`SshFileEntry`、`SftpTransferProgress`）。
- [x] 兼容性验证：移除后 `cargo check`、`npm run build`、`npm test` 均通过。

---

## Phase 10：SSH 密钥管理

### 10.1 Rust 后端 - 密钥操作
- [ ] `key_store.rs`：实现 `load_private_key(path, passphrase?) -> Result<KeyPair>`（使用 `ssh-key` crate 解析 OpenSSH / PEM 格式）
- [x] `cmd_ssh_list_keys() -> Vec<SshKeyInfo>`：从 `ssh_keys` 表查询
- [ ] `cmd_ssh_import_key(name: String, private_key_path: String, passphrase?: String) -> Result<String>`：
  - 解析私钥文件，验证格式有效
  - 提取公钥文本（`ssh-ed25519 AAA... comment` 格式）
  - 密钥口令加密后存 `ssh_keys` 表，返回 key id
- [x] `cmd_ssh_delete_key(id: String) -> Result<()>`
- [x] `cmd_ssh_generate_key(name: String, key_type: KeyType, bits?: u32, passphrase?: String) -> Result<SshKeyPair>`：
  - 支持 `Ed25519`（推荐）、`RSA-4096`
  - 返回 `{ private_key_pem, public_key }`（private_key_pem 不存到数据库，由用户自行保存）
- [x] `cmd_ssh_get_public_key(id: String) -> Result<String>`：返回公钥文本，便于复制到服务器

### 10.2 前端 - 密钥管理页
- [x] `KeyManager.tsx`：列表展示所有已导入密钥（名称、类型、指纹、导入时间）
- [x] 工具栏：导入密钥、生成新密钥
- [x] 每行操作：复制公钥到剪贴板、删除（二次确认）
- [x] `KeyImportForm.tsx`：Modal 表单，字段：名称、私钥文件路径（文件选择器）、口令（可选）；点击确认后调用 `cmd_ssh_import_key`，失败时显示具体错误（格式不支持/口令错误）
- [ ] 生成密钥 Modal：选择类型（Ed25519 / RSA-4096）、名称、口令（可选）；生成后展示私钥文本框（提示"请立即保存，关闭后不再显示"）+ 保存到文件按钮；自动将公钥存入 `ssh_keys` 表

---

## Phase 11：端口转发

### 11.1 Rust 后端 - 本地端口转发
- [ ] `tunnel.rs`：实现 `LocalTunnel` 结构体，使用 `tokio::net::TcpListener` 监听本地端口
- [ ] 每次本地连接建立时，在 SSH 会话上打开一条 `direct-tcpip` channel，双向 pipe 本地 TCP 流与 SSH channel
- [x] `cmd_tunnel_start_local(conn_id, rule_id, local_port, remote_host, remote_port) -> Result<()>`：启动本地转发，更新 `port_forward_rules.status = 'running'`
- [x] `cmd_tunnel_stop(rule_id) -> Result<()>`：关闭监听器，断开所有关联 channel，状态改为 `stopped`

### 11.2 Rust 后端 - 远程端口转发
- [ ] 在 SSH 会话上发送 `tcpip-forward` 请求，服务端监听 `remote_port`
- [ ] 收到服务端 `forwarded-tcpip` channel 后，本地连接 `local_host:local_port`，双向 pipe
- [x] `cmd_tunnel_start_remote(conn_id, rule_id, remote_port, local_host, local_port) -> Result<()>`

### 11.3 Rust 后端 - 动态 SOCKS5 转发
- [ ] 本地启动 SOCKS5 代理服务器（`tokio` 手写或使用 `fast-socks5` crate）
- [ ] 每个 SOCKS5 连接请求解析目标地址，通过 SSH `direct-tcpip` channel 中转
- [x] `cmd_tunnel_start_dynamic(conn_id, rule_id, local_port) -> Result<()>`

### 11.4 Rust 后端 - 规则持久化与自启
- [x] `cmd_tunnel_list_rules(conn_id) -> Vec<TunnelRule>`
- [x] `cmd_tunnel_save_rule(form: TunnelRuleForm) -> Result<String>`
- [x] `cmd_tunnel_delete_rule(id: String) -> Result<()>`
- [ ] SSH 连接成功后，自动启动该连接下 `auto_start = true` 的转发规则
- [ ] 转发异常时（SSH 断开/端口占用）通过 Tauri 事件 `ssh://tunnel-error/{rule_id}` 推送错误

### 11.5 前端 - 转发管理页
- [x] `TunnelManager.tsx`：以连接为分组，展示该连接下所有转发规则
- [x] 每条规则显示：名称、类型（本地/远程/动态）、端口映射、状态开关（Toggle：运行/停止）、错误提示
- [x] 工具栏：新建规则按钮
- [x] `TunnelRuleForm.tsx`：Modal 表单，字段：
  - 名称、所属连接（下拉）、转发类型（单选 Tab）
  - 本地转发：本地端口、远程主机、远程端口
  - 远程转发：远程端口、本地主机、本地端口
  - 动态转发：本地 SOCKS5 端口
  - 开机自启（Toggle）
- [ ] 状态实时更新：监听 `ssh://tunnel-error/{rule_id}` 事件，规则行显示红色错误角标

---

## Phase 12：快捷指令增强、会话录制与打包更新

### 12.1 会话录制（Asciinema 格式）
- [ ] Rust：新增 `cmd_ssh_start_recording(session_id, output_path) -> Result<()>`：开始录制，将终端输出写入 `.cast` 文件（Asciinema v2 格式）
- [ ] `cmd_ssh_stop_recording(session_id) -> Result<String>`：停止录制，返回文件路径
- [ ] 前端终端标签右键菜单增加"开始录制 / 停止录制"
- [ ] 录制状态：终端标签右上角显示红色录制指示点
- [ ] 录制文件管理：设置页新增"录制历史"列表，可打开文件夹或删除

### 12.2 快捷指令增强
- [ ] 支持指令变量占位符：`{REMOTE_PATH}`、`{DATE}` 等，发送前弹窗填写变量值
- [ ] 支持从剪贴板自动填充变量（Ctrl+V 快速填充）
- [ ] 指令导入导出（JSON 格式），方便团队共享

### 12.3 SSH 配置文件导入
- [ ] `cmd_ssh_import_config(path: String) -> Result<Vec<SshConnectionForm>>`：解析 `~/.ssh/config` 文件，提取 Host 配置块
- [ ] 前端：连接管理页"从 SSH config 导入"按钮，解析后展示预览列表（可勾选），确认后批量写入数据库

### 12.4 跳板机支持完善
- [ ] Rust 实现 ProxyJump：先 SSH 到跳板机，再通过跳板机上的 `direct-tcpip` channel 连接目标主机（纯 Rust 链式 Session，不依赖外部 ssh 二进制）
- [ ] 支持多级跳板（最多 3 跳）
- [ ] 连接表单"跳板机"字段支持配置

### 12.5 打包更新（第二期）
- [ ] `tauri.conf.json` 版本号升至 `0.2.0`
- [ ] 更新 GitHub Actions CI：`v0.2.*` tag 触发构建
- [ ] Release Notes 模板增加 SSH 功能说明
- [ ] 更新应用内"关于"页，列出版本历史

---

## 第二期风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| russh 在 Windows WebView2 环境下的 async 兼容性 | 中 | 所有 SSH I/O 在 Tauri Tokio runtime 线程池执行，与 UI 线程完全隔离 |
| 大文件 SFTP 传输阻塞 UI | 高 | 传输在独立 Tokio task 运行，进度通过事件推送，UI 不阻塞 |
| PTY 输出乱码（编码问题） | 中 | 连接配置支持自定义编码，xterm.js 统一 UTF-8 解码，服务端 LANG 不匹配时提示用户修改编码设置 |
| 端口转发端口冲突 | 低 | 启动前检测本地端口占用（`TcpListener::bind` 探测），冲突时返回具体错误信息 |
| 跳板机多跳延迟高 | 低 | 连接时显示每跳延迟，超时阈值可配置 |
| 密钥文件路径含中文/空格 | 低 | 使用 `std::path::PathBuf` 全程处理，不拼接字符串路径 |

---

# 第三期：S3 对象存储浏览器插件

> 目标：基于 S3 标准协议，支持 AWS S3、MinIO、阿里云 OSS、腾讯云 COS、Cloudflare R2 等兼容服务，提供 Bucket 管理、对象浏览、上传下载、预签名 URL、版本管理等完整能力。

---

## 第三期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| S3 客户端 | `aws-sdk-s3`（Rust 官方） | 支持自定义 endpoint，覆盖全部 S3-compatible 服务，原生 async |
| HTTP 运行时 | `aws-config` + `tokio` | aws-sdk 依赖，已有 tokio |
| 拖放上传 | `react-dropzone` | 文件/文件夹拖入区域触发上传 |
| 文件预览 | `react-pdf`（PDF）+ 原生 `<img>`/`<video>` | 对象内容预览 |
| 代码高亮 | `shiki` | JSON/XML/文本对象内容高亮显示 |
| 大小格式化 | `filesize` | 对象大小友好展示（KB/MB/GB） |

---

## 第三期目录结构增量

```
src/plugins/s3-browser/
├── index.tsx                       # 插件入口（注册 manifest）
├── store/
│   ├── s3-connections.ts           # S3 连接列表状态
│   ├── bucket.ts                   # 当前 Bucket 状态（选中、列表）
│   ├── objects.ts                  # 对象列表、当前前缀、选中对象
│   └── transfers.ts                # 上传/下载任务队列
├── views/
│   ├── S3ConnectionList.tsx        # 连接管理主页
│   ├── BucketList.tsx              # Bucket 列表页
│   ├── ObjectBrowser.tsx           # 对象浏览主视图
│   ├── ObjectPreview.tsx           # 对象内容预览
│   └── BucketSettings.tsx          # Bucket 设置（策略/版本/生命周期）
└── components/
    ├── S3ConnectionForm.tsx        # 新建/编辑连接表单
    ├── ObjectList.tsx              # 对象列表（虚拟滚动）
    ├── BreadcrumbNav.tsx           # 前缀路径面包屑
    ├── UploadDropzone.tsx          # 拖放上传区域
    ├── TransferQueue.tsx           # 传输任务面板
    ├── PresignedUrlModal.tsx       # 预签名 URL 生成弹窗
    ├── CreateFolderModal.tsx       # 新建"文件夹"（前缀）弹窗
    ├── ObjectMetaDrawer.tsx        # 对象元数据侧边抽屉
    └── BucketPolicyEditor.tsx      # 存储桶策略 JSON 编辑器

src-tauri/src/plugins/s3/
├── mod.rs
├── client_pool.rs                  # S3 Client 池（按连接 id 缓存）
├── commands.rs                     # 所有 Tauri Command 暴露层
└── types.rs                        # Serde 数据结构定义
```

---

## Phase 13：S3 插件脚手架与连接管理

### 13.1 SQLite 扩展
- [x] `db/init.rs` 新增建表 `s3_connections`：
  - 字段：`id`（UUID）、`name`、`group_name`、`provider`（`aws` / `minio` / `aliyun` / `tencent` / `r2` / `custom`）、`endpoint`（自定义 endpoint，AWS 填空则自动推断）、`region`、`access_key_id`、`secret_access_key_encrypted`、`path_style`（bool，MinIO 等需要 path-style）、`default_bucket`（可空）、`created_at`

### 13.2 Rust 后端 - S3 Client 池
- [x] `client_pool.rs`：`OnceLock<Mutex<HashMap<String, aws_sdk_s3::Client>>>` 按连接 id 缓存 Client
- [x] `build_client(config: &S3ConnectionConfig) -> aws_sdk_s3::Client`：
  - 使用 `aws_config::from_env()` 或手动构造 `Credentials`
  - 若配置了 `endpoint`，注入 `endpoint_url()`
  - `path_style = true` 时启用 `force_path_style(true)`
  - 区分 provider 预置常用 endpoint（如阿里云 `oss-cn-{region}.aliyuncs.com`、腾讯云 `cos.{region}.myqcloud.com`）
- [x] `get_client(conn_id) -> Result<aws_sdk_s3::Client>`：从池中获取，不存在则返回错误
- [x] `remove_client(conn_id)`：断开时清理

### 13.3 Rust 后端 - 连接 CRUD Commands
- [x] `db/s3_connection_repo.rs`：实现 `list_s3_connections()`、`save_s3_connection()`、`delete_s3_connection()`、`get_s3_connection(id)`
  - `secret_access_key` 使用已有 `crypto` 模块加密存储
- [x] `commands.rs` 暴露：
  - [x] `cmd_s3_list_connections() -> Vec<S3ConnectionInfo>`
  - [x] `cmd_s3_save_connection(form: S3ConnectionForm) -> Result<String>`（返回 id）
  - [x] `cmd_s3_delete_connection(id: String) -> Result<()>`
  - [x] `cmd_s3_test_connection(form: S3ConnectionForm) -> Result<u64>`：临时构造 Client，调用 `list_buckets()`，返回耗时毫秒
  - [x] `cmd_s3_connect(id: String) -> Result<()>`：从 DB 读取配置，构造 Client 存入池
  - [x] `cmd_s3_disconnect(id: String) -> Result<()>`

### 13.4 前端 - 连接列表页
- [x] `S3ConnectionList.tsx`：卡片列表，展示连接名、provider 图标（AWS/MinIO/阿里云等品牌 Logo）、endpoint 简览、连接状态点
- [x] 工具栏：新建连接、搜索（按名称/provider 过滤）
- [x] 右键菜单：连接（进入 Bucket 列表）、编辑、复制配置、删除
- [x] 双击直接进入该连接的 Bucket 列表视图

### 13.5 前端 - 连接表单
- [x] `S3ConnectionForm.tsx`：Modal + Form，分"基本"/"高级"两个 Tab
- [x] 基本 Tab：名称、分组、Provider 下拉（选 AWS 后自动填 region 列表；选 MinIO/Custom 后显示 Endpoint 输入框）、Access Key ID、Secret Access Key（密码框）、Region（文本或下拉）
- [x] 高级 Tab：自定义 Endpoint、Path-Style（开关，MinIO 默认开）、默认打开 Bucket（可选）、连接超时（秒）
- [x] Provider 切换时，根据内置映射自动填充 endpoint 模板（如选"阿里云 OSS"后显示 region 下拉并自动拼接 endpoint）
- [x] "测试连接"按钮：调用 `cmd_s3_test_connection`，显示耗时或错误
- [x] 表单校验：name/accessKeyId/secretAccessKey 必填；选 Custom 时 endpoint 必填

### 13.6 前端 - 连接状态管理
- [x] Zustand `s3-connections.ts`：`connections[]`、`connectedIds: Set<string>`、`activeConnId: string | null`
- [x] 操作：`fetchConnections()`、`upsertConnection()`、`removeConnection()`、`setActive(id)`

---

## Phase 14：Bucket 浏览器

### 14.1 Rust 后端 - Bucket 操作
- [x] `cmd_s3_list_buckets(conn_id) -> Result<Vec<BucketInfo>>`：调用 `list_buckets()`，返回 `{ name, creation_date, region? }`
- [x] `cmd_s3_create_bucket(conn_id, name, region?) -> Result<()>`：调用 `create_bucket()`，自动处理 AWS `CreateBucketConfiguration`（非 us-east-1 需要指定 region）
- [x] `cmd_s3_delete_bucket(conn_id, name) -> Result<()>`：调用 `delete_bucket()`（桶必须为空，否则返回具体错误）
- [x] `cmd_s3_get_bucket_location(conn_id, bucket) -> Result<String>`：获取 bucket 所在 region
- [x] `cmd_s3_get_bucket_versioning(conn_id, bucket) -> Result<VersioningStatus>`：返回 `Enabled / Suspended / Disabled`
- [x] `cmd_s3_set_bucket_versioning(conn_id, bucket, enabled: bool) -> Result<()>`

### 14.2 前端 - Bucket 列表页
- [x] `BucketList.tsx`：表格展示 Bucket 名、Region、创建时间、版本控制状态
- [x] 工具栏：新建 Bucket 按钮、搜索框（前端名称过滤）、刷新
- [x] 每行操作：打开（进入对象浏览器）、复制 Bucket 名、查看设置、删除（二次确认，提示"须先清空所有对象"）
- [x] 点击行 → 进入该 Bucket 的 `ObjectBrowser` 视图，面包屑根节点为 Bucket 名

### 14.3 前端 - 新建 Bucket
- [x] Modal 表单：Bucket 名（校验 AWS 命名规则：3-63 字符、小写字母数字连字符、不能 IP 格式）、Region 下拉、是否启用版本控制（默认关）
- [x] 创建成功后自动追加到列表并高亮

---

## Phase 15：对象浏览器

### 15.1 Rust 后端 - 对象列表
- [x] `cmd_s3_list_objects(conn_id, bucket, prefix, continuation_token?, max_keys=200) -> Result<ListObjectsResult>`
  - 调用 `list_objects_v2()`，使用 `delimiter = "/"` 模拟目录结构
  - 返回 `{ objects: Vec<ObjectItem>, common_prefixes: Vec<String>, next_token?, is_truncated }`
  - `ObjectItem`：`{ key, size, last_modified, etag, storage_class, is_latest? }`
- [x] `cmd_s3_list_object_versions(conn_id, bucket, prefix) -> Result<Vec<ObjectVersion>>`：列出所有版本（开启版本控制时使用）

### 15.2 Rust 后端 - 对象基本操作
- [x] `cmd_s3_head_object(conn_id, bucket, key) -> Result<ObjectMeta>`：获取元数据（`{ content_type, content_length, last_modified, etag, metadata: HashMap, version_id? }`）
- [x] `cmd_s3_delete_object(conn_id, bucket, key, version_id?) -> Result<()>`
- [x] `cmd_s3_delete_objects(conn_id, bucket, keys: Vec<String>) -> Result<DeleteObjectsResult>`：批量删除，返回 `{ deleted_count, errors: Vec<DeleteError> }`
- [x] `cmd_s3_copy_object(conn_id, src_bucket, src_key, dst_bucket, dst_key) -> Result<()>`：同账号内复制
- [x] `cmd_s3_move_object(conn_id, src_bucket, src_key, dst_bucket, dst_key) -> Result<()>`：复制后删除源
- [x] `cmd_s3_rename_object(conn_id, bucket, old_key, new_key) -> Result<()>`：等同于同桶内 move
- [x] `cmd_s3_create_folder(conn_id, bucket, prefix) -> Result<()>`：上传一个空的 `prefix/` 对象模拟文件夹

### 15.3 前端 - 对象浏览主视图
- [x] `ObjectBrowser.tsx`：顶部面包屑导航 + 工具栏 + 主体对象列表
- [x] `BreadcrumbNav.tsx`：展示当前路径（连接名 / Bucket 名 / 前缀层级），点击任意层跳转
- [x] 工具栏（左）：上传文件、上传文件夹、新建文件夹
- [x] 工具栏（右）：视图切换（列表/网格）、排序（名称/大小/修改时间）、搜索框（调用 list 过滤 prefix）、刷新

### 15.4 前端 - 对象列表组件
- [x] `ObjectList.tsx`：使用 `@tanstack/react-virtual` 虚拟渲染，支持万级对象不卡顿
- [x] 列表模式：图标（文件夹/文件类型）、名称、大小、修改时间、存储类型、操作列
- [x] 网格模式：文件图标卡片（图片类型显示缩略图）
- [x] 文件夹行（common_prefix）：双击进入，右键菜单：下载文件夹（递归）、删除文件夹（递归）、复制路径
- [x] 文件行右键菜单：下载、预览、复制 URL（公开）、生成预签名 URL、复制对象路径、重命名、移动、删除
- [x] 多选：Checkbox 列 + Shift 连选 + Ctrl 单选；选中后底部浮现批量操作栏（批量下载、批量删除、批量移动）
- [x] "加载更多"按钮（基于 `continuation_token` 分页，每次 200 条）

### 15.5 前端 - 对象元数据侧边抽屉
- [x] `ObjectMetaDrawer.tsx`：点击文件行"详情"打开右侧抽屉
- [x] 展示：对象键名、存储类型、大小、ETag、最后修改时间、Content-Type、自定义 Metadata（key-value 表格）、版本 ID（若启用版本控制）
- [ ] 版本历史列表（当 Bucket 开启版本控制时）：展示所有版本，可下载指定版本、删除特定版本

---

## Phase 16：上传下载与进度管理

### 16.1 Rust 后端 - 分片上传
- [x] `cmd_s3_upload_file(conn_id, bucket, key, local_path, storage_class?) -> Result<String>`（返回 transfer_id）：
  - 文件 < 5MB：单次 `put_object()` 上传
  - 文件 ≥ 5MB：启动 Multipart Upload（`create_multipart_upload`），按 8MB 分片并发上传（最多 4 个并发 part），完成后 `complete_multipart_upload`
  - 每上传完一个分片，通过 Tauri 事件 `s3://transfer-progress/{transfer_id}` 推送 `{ transferred, total, speed_bps }`
- [x] `cmd_s3_upload_folder(conn_id, bucket, prefix, local_dir) -> Result<String>`（返回 batch_id）：遍历本地目录，为每个文件生成独立 transfer_id，所有任务并发度限制为 4
- [x] `cmd_s3_cancel_upload(transfer_id) -> Result<()>`：中止 Multipart Upload（调用 `abort_multipart_upload`）

### 16.2 Rust 后端 - 下载
- [x] `cmd_s3_download_object(conn_id, bucket, key, local_path, version_id?) -> Result<String>`（返回 transfer_id）：
  - 调用 `get_object()`，流式写入本地文件
  - 每 256KB 推送一次进度事件
- [x] `cmd_s3_download_objects(conn_id, bucket, keys: Vec<String>, local_dir) -> Result<String>`（批量下载，返回 batch_id）：保留对象键的相对路径结构，并发度 4
- [x] `cmd_s3_download_folder(conn_id, bucket, prefix, local_dir) -> Result<String>`：列出前缀下所有对象后批量下载，递归保留目录结构
- [x] `cmd_s3_cancel_download(transfer_id) -> Result<()>`

### 16.3 前端 - 拖放上传
- [ ] `UploadDropzone.tsx`：对象列表区域整体作为 drop zone（使用 `react-dropzone`）
- [ ] 拖入文件：解析 `FileList`，调用 `cmd_s3_upload_file` 逐个上传
- [ ] 拖入文件夹：调用 Tauri `dialog` 选择文件夹后 `cmd_s3_upload_folder`
- [ ] 点击工具栏"上传文件"：调用系统文件选择对话框（多选），支持同时选择多个文件
- [ ] 点击工具栏"上传文件夹"：调用系统文件夹选择对话框

### 16.4 前端 - 传输队列面板
- [ ] `TransferQueue.tsx`：底部可折叠面板（与 SSH 期的传输面板复用同一设计语言）
- [ ] 每个任务显示：文件名、方向图标（上传↑/下载↓）、进度条、速度（如"3.2 MB/s"）、已传/总量、状态（等待中/传输中/完成/失败/已取消）
- [ ] 任务操作：取消（传输中）、重试（失败时）、打开文件夹（完成的下载任务）
- [ ] Zustand `transfers.ts`：监听 `s3://transfer-progress/{transfer_id}` 事件，更新进度；维护 `transferMap`，按状态分组统计
- [ ] 底部最小化后状态栏角标显示"↑2 ↓1"（活跃传输数）

---

## Phase 17：对象预览与预签名 URL

### 17.1 Rust 后端 - 对象内容读取
- [x] `cmd_s3_get_object_text(conn_id, bucket, key, version_id?) -> Result<String>`：读取对象内容为字符串（限 2MB，超出报错）
- [x] `cmd_s3_get_object_bytes(conn_id, bucket, key, version_id?) -> Result<Vec<u8>>`：读取二进制内容（限 10MB，图片/PDF 预览用）
- [x] `cmd_s3_generate_presigned_url(conn_id, bucket, key, expires_secs: u64, version_id?) -> Result<String>`：
  - 使用 `aws_sdk_s3::presigning::PresigningConfig` 生成预签名 GET URL
  - 支持设置过期时间（1分钟 ~ 7天）

### 17.2 前端 - 对象预览
- [x] `ObjectPreview.tsx`：Modal 或右侧抽屉展示对象内容，根据 Content-Type 选择渲染方式：
  - **图片**（`image/*`）：`<img>` 标签直接渲染（base64 或 presigned URL）
  - **视频**（`video/*`）：`<video>` 标签 + 预签名 URL 流式播放
  - **音频**（`audio/*`）：`<audio>` 标签 + 播放控件
  - **PDF**（`application/pdf`）：`react-pdf` 渲染，支持翻页
  - **文本/代码**（`text/*`、`application/json`、`application/xml` 等）：`shiki` 代码高亮，自动检测语言
  - **其他**：显示"无法预览，请下载后查看"+ 下载按钮
- [x] 预览 Modal 顶部显示：对象键名、大小、Content-Type；操作按钮：下载、复制预签名 URL

### 17.3 前端 - 预签名 URL 弹窗
- [x] `PresignedUrlModal.tsx`：选择过期时间（下拉：5分钟/1小时/1天/7天/自定义）、点击生成调用 `cmd_s3_generate_presigned_url`
- [x] 展示生成的 URL（只读文本框）、一键复制按钮
- [ ] 显示过期时间倒计时提示（"此链接将在 X 时间后失效"）

---

## Phase 18：高级功能

### 18.1 Rust 后端 - 存储桶策略
- [x] `cmd_s3_get_bucket_policy(conn_id, bucket) -> Result<String>`：返回 JSON 字符串（策略不存在时返回空字符串）
- [x] `cmd_s3_set_bucket_policy(conn_id, bucket, policy_json: String) -> Result<()>`：校验 JSON 格式后提交
- [x] `cmd_s3_delete_bucket_policy(conn_id, bucket) -> Result<()>`

### 18.2 Rust 后端 - 生命周期规则
- [ ] `cmd_s3_get_lifecycle_rules(conn_id, bucket) -> Result<Vec<LifecycleRule>>`：解析 XML 响应为结构化数据
  - `LifecycleRule`：`{ id, prefix, status, expiration_days?, transition_days?, transition_storage_class? }`
- [ ] `cmd_s3_set_lifecycle_rules(conn_id, bucket, rules: Vec<LifecycleRule>) -> Result<()>`
- [ ] `cmd_s3_delete_lifecycle_rules(conn_id, bucket) -> Result<()>`

### 18.3 Rust 后端 - 对象标签
- [x] `cmd_s3_get_object_tags(conn_id, bucket, key) -> Result<Vec<Tag>>`
- [x] `cmd_s3_set_object_tags(conn_id, bucket, key, tags: Vec<Tag>) -> Result<()>`
- [x] `cmd_s3_delete_object_tags(conn_id, bucket, key) -> Result<()>`

### 18.4 Rust 后端 - 存储统计
- [x] `cmd_s3_get_bucket_stats(conn_id, bucket, prefix?) -> Result<BucketStats>`：
  - 遍历对象（分页 list），统计 `{ object_count, total_size, storage_class_breakdown: HashMap }`
  - 数量大时后台异步执行，通过事件 `s3://stats-progress/{task_id}` 推送中间结果

### 18.5 前端 - Bucket 设置页
- [x] `BucketSettings.tsx`：Tabs 页（概览 / 版本控制 / 生命周期 / 存储桶策略）
- [x] **概览 Tab**：显示 `BucketStats`（对象数量、总大小、存储类型分布饼图）、Region、创建时间
- [x] **版本控制 Tab**：Toggle 开启/暂停版本控制，显示当前状态说明
- [ ] **生命周期 Tab**：规则列表（前缀、过期天数、转储类型）；支持新增/编辑/删除规则（Modal 表单：前缀、到期后删除天数、转 IA/Glacier 天数）
- [x] **存储桶策略 Tab**：`BucketPolicyEditor.tsx`，Monaco-like JSON 编辑器（使用 `shiki` 高亮），展示当前策略，支持格式化、校验、保存；提供常用策略模板下拉（公开读、私有、仅特定 IP）

### 18.6 前端 - 对象标签管理
- [x] `ObjectMetaDrawer.tsx` 增加"标签"折叠面板
- [x] 展示当前对象标签（key-value 表格），支持新增（行内输入）、删除（行末删除按钮）、保存

---

## Phase 19：打包更新（第三期）

### 19.1 版本更新
- [x] `tauri.conf.json` 版本号升至 `0.3.0`
- [x] `Cargo.toml` 同步版本号

### 19.2 CI/CD 更新
- [x] GitHub Actions 增加 `v0.3.*` tag 构建触发
- [x] Release Notes 模板增加 S3 功能说明

### 19.3 应用内更新
- [ ] "关于"页版本历史增加 v0.3.0 条目
- [ ] 应用内更新检测逻辑兼容新版本号

---

## 第三期风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| 各厂商 S3 兼容性差异（签名算法/path style/字段缺失） | 高 | 按 provider 预置配置模板，测试连接时做兼容性探测，错误信息给出具体 provider 提示 |
| 大桶（千万对象）列表分页性能 | 高 | 虚拟列表 + 每次仅加载 200 条，搜索走前缀过滤而非全量 list |
| 大文件分片上传中断恢复 | 中 | 记录 upload_id 到 SQLite，重启后可继续；超过 48h 未完成的 Multipart 自动 abort |
| Presigned URL 包含密钥信息（安全） | 低 | 本地生成，不发送到任何中间服务；URL 展示时提示有效期 |
| 跨账号/跨 region 复制失败 | 中 | 先提示用户"不支持跨账号复制"；同账号跨 region 通过 copy_object 的 source_bucket/region 参数处理 |
| PDF/视频预览文件过大导致内存溢出 | 中 | 视频走 presigned URL 流式播放（不落内存）；PDF 限制 50 页预览；图片限制 10MB |

---

# 第四期：MongoDB 连接工具插件

> 目标：新增 `mongodb-client` 插件，提供 MongoDB 连接管理、数据库/集合浏览、文档 CRUD、查询/聚合、索引管理、导入导出和基础服务器状态能力。

---

## 第四期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| MongoDB 客户端 | `mongodb` Rust 官方驱动 | Tokio async，支持 URI、认证、TLS、Replica Set/SRV 连接串 |
| BSON/JSON | `bson` / MongoDB Extended JSON | 保留 ObjectId、Date、Decimal128 等 MongoDB 类型语义 |
| 文档编辑 | JSON 编辑 + 格式化/校验 | 第一版不做复杂表格行内编辑，降低嵌套结构误操作 |
| 本地存储 | SQLite + AES-GCM | 沿用现有连接配置与敏感字段加密策略 |

---

## Phase 20：MongoDB 插件脚手架与连接管理

### 20.1 Rust 后端 - 数据结构与连接配置
- [x] `Cargo.toml` 增加 `mongodb` 依赖
- [x] `db/init.rs` 增加 `mongodb_connections` 表
- [x] 新增 `db/mongodb_connection_repo.rs`：连接配置 CRUD，URI/password 加密存储
- [x] 支持连接模式：`uri` / `form`
- [x] 表单连接字段：host、port、username、password、auth_database、default_database、replica_set、tls、srv

### 20.2 Rust 后端 - Client 池与 Commands
- [x] 新增 `plugins/mongodb/{mod,types,client_pool,commands}.rs`
- [x] `client_pool.rs`：按 connection id 缓存 `mongodb::Client`
- [x] `cmd_mongo_test_connection(form) -> MongoLatency`：临时构造 client，执行 `ping`
- [x] `cmd_mongo_connect(id)`：读取配置与密文，建立 client 并存入池
- [x] `cmd_mongo_disconnect(id)`：从池移除 client
- [x] `cmd_mongo_list/save/delete_connections`

### 20.3 前端 - 插件注册与连接页
- [x] 新增 `src/plugins/mongodb-client/index.tsx` 并注册到 builtin plugins
- [x] 新增 `types.ts`、`store/mongodb-connections.ts`
- [x] 新增 `MongoConnectionList.tsx`：分组连接卡片、搜索、新建、编辑、删除、双击连接
- [x] 新增 `MongoConnectionForm.tsx`：URI/表单模式切换、测试连接、TLS/SRV/Replica Set 配置
- [x] 连接成功后自动跳转 `Databases`

---

## Phase 21：数据库与集合浏览

### 21.1 Rust 后端
- [x] `cmd_mongo_list_databases(conn_id) -> Vec<MongoDatabaseInfo>`
- [x] `cmd_mongo_list_collections(conn_id, database) -> Vec<MongoCollectionInfo>`
- [x] `cmd_mongo_get_collection_stats(conn_id, database, collection) -> MongoCollectionStats`
- [x] `cmd_mongo_create_collection(conn_id, database, collection)`
- [x] `cmd_mongo_drop_collection(conn_id, database, collection)`

### 21.2 前端
- [x] 新增 `DatabaseBrowser.tsx`
- [x] 左侧数据库列表，中间集合列表，右侧统计卡片
- [x] 点击集合自动设置 active database/collection 并跳转 `Documents`
- [x] 支持刷新、创建集合、删除集合二次确认

---

## Phase 22：文档浏览与 CRUD

### 22.1 Rust 后端
- [x] `cmd_mongo_find_documents(conn_id, database, collection, filter_json, projection_json?, sort_json?, skip, limit)`
- [x] `cmd_mongo_count_documents(conn_id, database, collection, filter_json)`
- [x] `cmd_mongo_insert_document(conn_id, database, collection, document_json)`
- [x] `cmd_mongo_update_document(conn_id, database, collection, id_json, document_json)`
- [x] `cmd_mongo_delete_documents(conn_id, database, collection, filter_json)`
- [x] 返回 Extended JSON 字符串，避免 MongoDB 特殊类型丢失

### 22.2 前端
- [x] 新增 `DocumentBrowser.tsx`
- [x] 顶部 filter/projection/sort JSON 输入区，默认 limit=50 分页
- [x] 文档列表支持 JSON 预览、复制、编辑、删除、批量删除
- [x] 新增/编辑文档使用 JSON 编辑器，保存前格式化与校验
- [x] `_id` 默认只读，更新时不允许修改 `_id`

---

## Phase 23：查询与聚合控制台

### 23.1 Rust 后端
- [x] `cmd_mongo_run_find_query`
- [x] `cmd_mongo_run_aggregate`
- [x] `cmd_mongo_run_database_command`
- [x] `cmd_mongo_list_query_history`
- [x] 新增 `mongodb_query_history` 表
- [x] 危险命令识别：drop/dropDatabase/deleteMany({})/updateMany({})/shutdown 等需要前端二次确认

### 23.2 前端
- [x] 新增 `QueryWorkspace.tsx`
- [x] 查询类型：Find / Aggregate / Command
- [x] 结果支持表格视图与 JSON 视图
- [x] 历史记录抽屉支持一键重跑

---

## Phase 24：索引管理

- [x] `cmd_mongo_list_indexes(conn_id, database, collection)`
- [x] `cmd_mongo_create_index(conn_id, database, collection, keys_json, options_json)`
- [x] `cmd_mongo_drop_index(conn_id, database, collection, index_name)`
- [x] 新增 `IndexManager.tsx`：展示索引名、keys、unique、sparse、TTL、大小
- [x] 新建索引 Modal 支持 keys JSON、name、unique、sparse、expireAfterSeconds

---

## Phase 25：导入导出

- [x] `cmd_mongo_export_documents(conn_id, database, collection, filter_json, format)`
- [x] `cmd_mongo_import_documents(conn_id, database, collection, file_path, mode)`
- [x] 支持 JSON Array 与 JSON Lines
- [x] 导入模式：insertOnly / upsertById / replaceById
- [x] 新增 `ImportExport.tsx`：导出当前查询/集合，导入前预览前 20 条，展示导入结果

---

## Phase 26：Server 信息与发布

- [x] `cmd_mongo_get_server_status`
- [x] `cmd_mongo_get_build_info`（通过 `buildInfo` 集成到 Server Status）
- [x] 新增 `ServerStatus.tsx`：版本、连接数、内存、opcounters 状态
- [x] Server 页面必须支持窗口缩放后的上下/左右滚动
- [x] 版本升至 `0.4.0`
- [x] 新增 `docs/releases/v0.4.0.md`
- [x] README 增加 MongoDB 插件说明
- [x] 运行 `npm test`、`npm run build`、`cargo check`、`npm run tauri build -- --bundles nsis`

---

## 开发进度（实时）

### 2026-04-27

- 14:07-14:08 使用 `create-tauri-app` 初始化 React + TypeScript + Tauri 2 项目模板。
- 14:08-14:27 完成 Phase 0 脚手架改造：目录结构、别名、依赖、窗口配置、基础页面替换。
- 14:29-14:34 完成插件注册表 TDD：先新增测试失败，再实现 `registry.ts` 使测试通过。
- 14:35-15:35 完成 Phase 0 前端骨架（`Titlebar`、`AppShell`、`Sidebar`、主题与插件注册）。
- 15:35-15:36 完成验证：`npm test` 通过，`npm run build` 通过（存在 bundle 体积告警，后续可分包优化）。
- 15:36-16:26 完成 Phase 1 连接管理闭环：SQLite CRUD、AES-GCM 密码加密、Redis 连接测试/连接池、前端连接列表与表单调用链路打通。
- 16:26-16:27 完成验证：`npm test` 通过，`npm run build` 通过（仍有 bundle 体积告警）。
- 17:57-18:06 修复 Phase 2 合并后的前后端编译问题：修复 `KeyBrowser.tsx` 类型错误、`db/init.rs` 的 `tauri::Manager` 导入缺失，恢复 `npm run build` 与 `cargo check` 可通过。
- 18:06-18:16 完成 Phase 2 核心交互：补齐 Key 详情区 5 类数据编辑器的真实命令调用链路（String/Hash/List/Set/ZSet），增加 ZSet 分数区间筛选后端命令并接入前端。
- 18:16-18:21 完成 KeyTree 升级：接入 `@tanstack/react-virtual` 虚拟渲染、分组展示、TTL 角标与批量操作联动（多选/批量删/批量 TTL）。
- 18:21-18:24 完成 Phase 3/4/5 增量：命令历史查询接口、危险命令二次确认执行、导入预览命令；前端补 xterm 控制台、命令补全与历史回放；ServerInfo 增加真实趋势序列与 DB 柱状图。
- 18:24-18:25 完成最终验证：`npm test` 通过，`npm run build` 通过，`cargo check` 通过（仅剩 `RedisConnectionType` 未使用告警）。

### 2026-04-28

- 10:00-10:16 开始第二期 SSH 插件开发（Phase 7 主线）：完成 `ssh-client` 插件注册与目录脚手架，新增连接列表页、连接表单、终端工作区/密钥/SFTP/隧道占位视图。
- 10:00-10:16 完成 Rust 后端 SSH 基础：`db/init.rs` 增加 `ssh_connections`/`ssh_keys`/`ssh_quick_commands`/`port_forward_rules` 建表；新增 `db/ssh_connection_repo.rs`，实现 SSH 连接 CRUD 与认证字段加密存储。
- 10:00-10:16 完成 SSH Command 与会话池基础：新增 `src-tauri/src/plugins/ssh/{mod,commands,session_pool,types}.rs`，并在 `lib.rs` 注册 `cmd_ssh_list/save/delete/test/connect/disconnect`。
- 10:12-10:16 完成验证：`cargo check` 通过（引入 russh 依赖后编译成功，存在 session_pool 未使用告警），`npm run build` 通过，`npm test` 通过。
- 10:20-11:22 完成 SSH 二期主线可运行闭环：后端新增 `terminal.rs`/`sftp.rs`/`key_store.rs`/`tunnel.rs` 并扩展 `commands.rs`，补齐终端事件推送、SFTP 文件操作与进度事件、密钥 CRUD/生成、隧道规则 CRUD 与启停。
- 10:20-11:22 完成前端 SSH 页面实装：`TerminalWorkspace` + `TerminalTab` 接入 xterm 与 Tauri 事件；`QuickCommandPanel` 接入快捷命令持久化；`SftpExplorer` 接入目录浏览/上传下载与传输队列；`KeyManager`/`KeyImportForm`、`TunnelManager`/`TunnelRuleForm` 接入后端命令。
- 11:20-11:22 完成验证：`cargo check` 通过，`npm run build` 通过，`npm test` 通过（仅保留原有 `RedisConnectionType` 未使用告警）。
- 11:22-13:44 完成打包与多轮修复：输出 Windows 安装包并按反馈修复连接页双击连接/跳转、DB 切换位置与 UI 布局、SSH 密钥文件权限处理与隐藏控制台窗口。
- 13:44-14:30 修复跳板机终端可用性与显示问题：修复 `openSession` 输出初始化时序，避免欢迎信息被清空；`TerminalTab` 改为增量写入，避免全量重绘造成交互异常；统一终端容器高度链路，消除下半白屏并铺满可用空间。
- 14:17-14:30 按当前产品决策下线 SFTP：前后端入口、命令导出、模块与类型定义全部移除。
- 15:16-15:19 完成最终验证与打包：`cargo check` 通过、`npm run build` 通过、`npm test` 通过，并生成 NSIS 安装包 `src-tauri/target/release/bundle/nsis/RDMM_0.1.0_x64-setup.exe`。
- 15:25-15:32 完成品牌图标升级：新增抽象几何科技风 SVG 母版 `src-tauri/icons/app-icon.svg`，使用 `tauri icon` 生成并覆盖全套平台图标（`icon.ico`/`icon.icns`/PNG/Appx/iOS/Android 资产），用于应用窗口与安装包统一视觉。
- 16:25-16:38 执行清理后重打包：清理 `dist` 与 `src-tauri/target` 旧产物（含 installer/exe 输出），基于新图标资源重新执行 `npm run tauri build -- --bundles nsis`，生成全新安装包并确认时间戳更新（16:37）。
- 16:50-16:59 修复 Windows 无边框窗口交互：标题栏拖拽改为显式 `startDragging()`，新增窗口四边与四角 resize 命中层并调用 `startResizeDragging()`，同时补充 capability 权限 `allow-start-dragging/allow-start-resize-dragging`，恢复窗口移动与放大缩小能力。
- 17:24-17:26 修复标题栏双击行为：在拖拽区增加 `onDoubleClick -> toggleMaximize()`，并在 `onMouseDown` 中跳过双击场景（`event.detail > 1`），避免拖拽与双击全屏/还原冲突。
- 19:20-19:54 启动第三期 Phase 13：完成 S3 插件连接管理闭环。后端新增 `s3_connections` 表、`db/s3_connection_repo.rs`、`plugins/s3/{mod,types,client_pool,commands}.rs`，并在 `lib.rs` 注册 `cmd_s3_list/save/delete/test/connect/disconnect`；前端新增 `s3-client` 插件（`index.tsx`、`types.ts`、`store/s3-connections.ts`、`views/S3ConnectionList.tsx`、`components/S3ConnectionForm.tsx`）并接入插件注册表。已完成验证：`cargo check`、`npm run build`、`npm test` 通过。
- 20:20-20:37 继续第三期 Phase 14 起步：后端新增 `cmd_s3_list_buckets(conn_id)`（连接后列出 Bucket）；前端新增 `BucketList.tsx` 并在 `s3-client/index.tsx` 增加 Connections/Buckets 分段导航，连接后自动加载 Bucket 列表。验证通过：`cargo check`、`npm run build`、`npm test`。
- 20:50-21:13 推进 Phase 14：补齐 `cmd_s3_create_bucket`、`cmd_s3_delete_bucket` 并注册到 Tauri；前端 `BucketList.tsx` 增加新建 Bucket Modal 与删除确认操作，连接后可直接完成 Bucket 列表刷新、新建、删除闭环。验证通过：`cargo check`、`npm run build`、`npm test`。
- 21:40-22:06 推进 Phase 15 基础对象浏览：后端新增 `cmd_s3_list_objects`（prefix + delimiter + continuation token 分页），并补充 `cmd_s3_delete_object`、`cmd_s3_create_folder`；前端新增 `ObjectBrowser.tsx`，支持目录进入、前缀刷新、加载更多、文件删除、新建文件夹，形成“连接 -> Bucket -> 对象”基础闭环。验证通过：`cargo check`、`npm run build`、`npm test`。
- 22:06-22:21 输出第三期阶段性安装包：在完成 S3 Phase 13 + 14 + 15 基础能力后执行 `npm run tauri build -- --bundles nsis`，生成最新安装包 `src-tauri/target/release/bundle/nsis/RDMM_0.1.0_x64-setup.exe`（22:20）。
- 23:47-23:55 修复 S3 导航与分页链路：将 S3 workspace tab 提升到 Zustand（Connections/Buckets/Objects 共享），连接成功后自动跳转 Buckets、打开 Bucket 后自动跳转 Objects；Bucket 列表改为可控分页（支持翻页与每页条数切换）并在筛选变更时重置页码；打开 Bucket 时重置 prefix 并立即触发对象加载，修复 Objects 视图空白问题。验证通过：`cargo check`、`npm run build`、`npm test`。

### 2026-04-29

- 00:08-00:11 接入 macOS 自动打包 CI：新增 `.github/workflows/build-macos.yml`，支持 `workflow_dispatch`、`push main`、`v*` tag 触发；在 `macos-latest` 上执行 `npm ci` + `npm run tauri build -- --bundles app,dmg`，并上传 `.app` 与 `.dmg` 构建产物。
- 00:20-00:27 扩展 CI 为全平台打包：将 workflow 升级为 `build-desktop`，新增 Windows（NSIS `.exe`）、macOS（`.app`/`.dmg`）、Linux（`.deb`/`.AppImage`）三个并行 job，统一支持 `workflow_dispatch`、`push main`、`v*` tag 触发并上传对应 artifacts。
- 13:08-13:13 品牌重命名：项目名由 RDMM 升级为 DevNexus（开发工具中枢）。已同步更新应用标题、Tauri productName/identifier（com.devnexus.desktop）、Rust crate 名（devnexus/devnexus_lib）、前端品牌文案、README 与跨平台 CI 产物命名。验证通过：`npm run build`、`cargo check`、`npm test`。
- 13:20-13:31 发版流程建设：新增 `.github/workflows/release.yml`，在 `v*` tag 触发时并行构建 Windows/macOS/Linux 包并自动上传到 GitHub Release；新增发布说明 `docs/releases/v0.1.0.md`；将 `build-desktop` 标签触发调整为仅 `workflow_dispatch` + `push main`，避免与 release 工作流重复构建。
- 16:00-16:05 Redis KeyBrowser 交互增强：实现 Key Tree 与 Key Detail 可拖拽分栏，支持中线拖动实时调整宽度，并添加最小宽度保护（左 300px / 右 420px）与分割条高亮反馈。同步新增发版文档 `docs/releases/v0.2.0.md`。

### 2026-05-07

- Redis 遗留任务补齐：KeyTree 改为按冒号分段的层级树展示，搜索输入增加 300ms 防抖 SCAN，key 行补齐右键菜单（复制、查看详情、设置 TTL、重命名、删除）；Console 顶部补齐连接/DB 切换，并优化 Array 缩进与 Error 红色输出。
- S3 第三期主链路补齐：扩展 S3 后端命令（Bucket region/versioning、对象版本/元数据、批量删除、复制/移动/重命名、上传/下载、预览、预签名 URL、Bucket Policy、对象标签、Bucket 统计），前端新增 ObjectList、ObjectMetaDrawer、ObjectPreview、PresignedUrlModal、BucketSettings，并将版本升至 `v0.3.0`，新增 `docs/releases/v0.3.0.md`。
- 修复 Redis Server 页面刷新闪跳：ServerInfo 改为按 section/card 局部更新，图表实例与滚动容器保持稳定，避免轮询刷新导致整页跳动。
- 修复 SSH 密码登录链路：密码直连 Terminal 改用原生会话通道，补齐连接测试与终端打开流程的密码认证兼容性。

### 2026-05-08

- 09:00-09:16 修复 Redis Server 页面缩放后不能滚动：Redis 工作区改为固定高度 flex，Server 页面增加独立纵向/横向滚动容器，避免窗口缩放后下方内容不可见。
- 09:30-09:40 完成第四期 MongoDB 插件详细规划写入 `PLAN.md`，新增 Phase 20-26 任务拆分。
- 09:40-10:05 完成 MongoDB 后端基础：新增 `mongodb_connections`/`mongodb_query_history` 表、连接配置加密 repo、MongoDB client pool、Tauri commands，并通过 `cargo check` 验证。
- 10:05-10:35 完成 MongoDB 前端主链路初版：新增 `mongodb-client` 插件、连接表单、连接列表、数据库/集合浏览、文档 CRUD、查询/聚合、索引、导入导出和 Server 状态页面。
- 10:35-10:56 完成第四期发布配套与验证：版本升至 `0.4.0`，新增 `docs/releases/v0.4.0.md`，README 增加 MongoDB 插件说明；`cargo check`、`npm test`、`npm run build`、`npm run tauri build -- --bundles nsis` 均通过，生成 `DevNexus_0.4.0_x64-setup.exe`。
- 11:00-11:05 优化 MongoDB Connections 标签尺寸：状态、默认数据库、TLS、SRV 标签改为小号样式，仅作用于 MongoDB 连接卡片；`npm run build` 验证通过。
- 11:49-11:56 执行 v0.4.0 发布前验证与打包：`npm test`、`cargo check`、`npm run build`、`npm run tauri build -- --bundles nsis` 通过，重新生成 `DevNexus_0.4.0_x64-setup.exe`，准备提交并推送 `v0.4.0` tag 触发 GitHub Release。


