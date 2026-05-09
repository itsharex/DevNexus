# DevNexus

[中文](#中文) | [English](#english)

---

## 中文

DevNexus 是一个基于 **Tauri 2 + React 19 + TypeScript + Rust** 的插件化桌面工具箱，面向开发、运维和日常数据管理场景。它把常用的连接类工具放进同一个轻量桌面应用里，当前重点覆盖 Redis、SSH、S3、MongoDB 和 MySQL。

当前版本：`0.5.0`

### 核心能力

| 插件 | 状态 | 主要能力 |
|------|------|----------|
| Redis Manager | 已实现 | 连接管理、DB 切换、Key 树浏览、Key 详情编辑、命令控制台、Server 信息、导入导出 |
| SSH Client | 已实现 | SSH 连接管理、多标签 Terminal、密钥管理、快捷命令、端口转发 |
| S3 Browser | 已实现 | S3 连接管理、Bucket 浏览、Object 浏览、上传下载、预览、预签名 URL、Bucket 设置 |
| MongoDB Client | 已实现 | 连接管理、数据库/集合浏览、文档 CRUD、查询/聚合、索引、导入导出、Server 状态 |
| MySQL Client | 已实现 | 连接管理、库表浏览、表数据 CRUD、SQL 查询、索引、导入导出、Server 状态 |

### 产品特点

- **插件化架构**：每个工具以独立插件组织，前端视图、状态和 Rust 后端命令按插件隔离。
- **本地优先**：连接配置存储在本机 SQLite 数据库中，敏感字段使用 AES-GCM 加密。
- **轻量桌面体验**：使用 Tauri 2，前端由 Vite 构建，后端由 Rust 提供系统能力和连接协议能力。
- **跨平台打包**：内置 Windows、macOS、Linux 的 GitHub Actions 构建与 Release 流程。
- **面向实际运维**：包含虚拟列表、分页加载、危险命令确认、可滚动监控页面等避免误操作和卡顿的细节。

### 技术栈

| 层级 | 技术 |
|------|------|
| Desktop | Tauri 2 |
| Frontend | React 19, TypeScript, Vite |
| UI | Ant Design, `@ant-design/icons` |
| State | Zustand |
| Charts | ECharts |
| Terminal | xterm.js / `@xterm/*` |
| Backend | Rust, Tokio |
| Local DB | SQLite via `rusqlite` |
| Redis | `redis` crate |
| SSH | `russh` / `russh-keys` |
| S3 | AWS Rust SDK |
| MongoDB | official `mongodb` Rust driver |
| MySQL | `mysql_async` |

### 项目结构

```text
src/
  app/                         应用壳、布局、插件注册表
  plugins/                     前端插件实现
    redis-manager/
    ssh-client/
    s3-client/
    mongodb-client/
    mysql-client/
  styles/                      全局样式

src-tauri/
  src/
    db/                        SQLite 初始化与连接配置仓储
    plugins/                   Rust 后端插件命令与连接池
      redis/
      ssh/
      s3/
      mongodb/
      mysql/
    crypto/                    本地敏感字段加解密
  icons/                       应用图标资源
  tauri.conf.json              Tauri 应用配置

docs/releases/                 版本发布说明
.github/workflows/             CI/CD 构建与发布工作流
tests/                         Vitest 测试
PLAN.md                        开发计划与实时进度
AGENTS.md                      仓库协作指南
```

### 环境要求

- Node.js 20+
- Rust stable
- Windows 开发/打包需满足 Tauri Windows 前置依赖
- macOS/Linux 打包需满足对应平台的 Tauri 前置依赖

参考：

- https://www.rust-lang.org/tools/install
- https://tauri.app/start/prerequisites/

### 本地开发

```bash
# 安装依赖
npm install

# 仅启动 Vite 前端开发服务
npm run dev

# 启动完整 Tauri 桌面开发模式
npm run tauri dev
```

### 验证命令

```bash
# 运行 Vitest
npm test

# TypeScript 类型检查 + 前端生产构建
npm run build

# Rust 后端编译检查
cd src-tauri
cargo check
```

说明：当前构建可能出现 Vite 大 chunk 警告，以及一个既有的 `RedisConnectionType` 未使用警告；只要命令退出码为 0，这两项不阻塞发布。

### 打包

```bash
# 当前平台默认打包
npm run tauri build

# Windows NSIS 安装包
npm run tauri build -- --bundles nsis

# macOS .app + .dmg
npm run tauri build -- --bundles app,dmg

# Linux .deb + .AppImage
npm run tauri build -- --bundles deb,appimage
```

Windows 产物示例：

```text
src-tauri/target/release/bundle/nsis/DevNexus_0.5.0_x64-setup.exe
```

### 发布流程

仓库包含两条 GitHub Actions 工作流：

- `.github/workflows/build-desktop.yml`：`push main` 或手动触发，构建并上传各平台 artifacts。
- `.github/workflows/release.yml`：推送 `v*` tag 后触发，构建 Windows/macOS/Linux 包并创建 GitHub Release。

发布一个新版本通常需要：

```bash
# 更新 package.json、src-tauri/Cargo.toml、src-tauri/tauri.conf.json 版本号
# 新增 docs/releases/vX.Y.Z.md
npm test
npm run build
cd src-tauri && cargo check

# 提交并推送 main 后打 tag
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

### 安全说明

- 不要提交真实连接密码、密钥、Token、对象存储凭据或本地数据库文件。
- 不要提交 `node_modules/`、`dist/`、`src-tauri/target/` 或打包生成的安装包。
- Redis、SSH、S3、MongoDB、MySQL 的连接数据都应视为敏感数据。
- 截图、测试夹具和 issue 描述中应隐藏主机地址、用户名、密钥路径和访问凭据。

### 当前限制

- Redis Sentinel/Cluster、S3 生命周期编辑、应用内自动更新等能力仍按 `PLAN.md` 继续迭代。
- MySQL 当前优先覆盖 MySQL 5.7/8.0 常用管理能力；MariaDB 基础协议兼容时可尝试使用，但不是当前验收重点。
- 大表、大桶、大集合场景应优先使用分页、前缀过滤或查询条件，避免一次性加载过多数据。

### 路线图

后续路线以 `PLAN.md` 为准。当前已完成 Redis、SSH、S3、MongoDB、MySQL 五条主线，后续将继续补齐导入导出细节、更新检测、更多数据库能力和体验优化。

---

## English

DevNexus is a plugin-based desktop toolbox built with **Tauri 2 + React 19 + TypeScript + Rust**. It is designed for everyday development, operations, and data-management workflows, bringing common connection-oriented tools into one lightweight desktop application.

Current version: `0.5.0`

### Features

| Plugin | Status | Capabilities |
|--------|--------|--------------|
| Redis Manager | Implemented | Connection management, DB switching, key tree browsing, key editing, console, server info, import/export |
| SSH Client | Implemented | SSH profiles, multi-tab terminal, key management, quick commands, port forwarding |
| S3 Browser | Implemented | S3 profiles, bucket browsing, object browsing, upload/download, preview, presigned URLs, bucket settings |
| MongoDB Client | Implemented | Profiles, database/collection browsing, document CRUD, find/aggregate/command workspace, indexes, import/export, server status |
| MySQL Client | Implemented | Profiles, database/table browsing, table-data CRUD, SQL workspace, indexes, import/export, server status |

### Highlights

- **Plugin-first design**: each tool keeps its UI, state, backend commands, and connection pool isolated.
- **Local-first storage**: connection profiles are stored in local SQLite; sensitive fields are encrypted with AES-GCM.
- **Lightweight desktop shell**: Tauri provides a small native shell while Rust handles protocol and system-facing work.
- **Cross-platform packaging**: GitHub Actions build Windows, macOS, and Linux packages.
- **Operational safety**: pagination, virtualized browsing, dangerous-command confirmations, and scroll-safe dashboards are built into the UX.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Tauri 2 |
| Frontend | React 19, TypeScript, Vite |
| UI | Ant Design, `@ant-design/icons` |
| State | Zustand |
| Charts | ECharts |
| Terminal | xterm.js / `@xterm/*` |
| Backend | Rust, Tokio |
| Local DB | SQLite via `rusqlite` |
| Redis | `redis` crate |
| SSH | `russh` / `russh-keys` |
| S3 | AWS Rust SDK |
| MongoDB | official `mongodb` Rust driver |
| MySQL | `mysql_async` |

### Repository Layout

```text
src/
  app/                         app shell, layout, plugin registry
  plugins/                     frontend plugins
    redis-manager/
    ssh-client/
    s3-client/
    mongodb-client/
    mysql-client/
  styles/                      global styles

src-tauri/
  src/
    db/                        SQLite schema and connection repositories
    plugins/                   Rust backend plugin commands and pools
      redis/
      ssh/
      s3/
      mongodb/
      mysql/
    crypto/                    local encryption helpers
  icons/                       application icons
  tauri.conf.json              Tauri configuration

docs/releases/                 release notes
.github/workflows/             CI/CD workflows
tests/                         Vitest tests
PLAN.md                        roadmap and live progress log
AGENTS.md                      contributor and agent guidelines
```

### Prerequisites

- Node.js 20+
- Rust stable
- Tauri prerequisites for the target platform

References:

- https://www.rust-lang.org/tools/install
- https://tauri.app/start/prerequisites/

### Development

```bash
# Install dependencies
npm install

# Start the Vite frontend only
npm run dev

# Start the full Tauri desktop app
npm run tauri dev
```

### Verification

```bash
# Run Vitest
npm test

# Type-check and build the frontend
npm run build

# Check the Rust backend
cd src-tauri
cargo check
```

Note: the current build may report a Vite large-chunk warning and an existing unused `RedisConnectionType` Rust warning. They do not block release as long as the commands exit with code 0.

### Packaging

```bash
# Build for the current platform
npm run tauri build

# Windows NSIS installer
npm run tauri build -- --bundles nsis

# macOS .app + .dmg
npm run tauri build -- --bundles app,dmg

# Linux .deb + .AppImage
npm run tauri build -- --bundles deb,appimage
```

Windows artifact example:

```text
src-tauri/target/release/bundle/nsis/DevNexus_0.5.0_x64-setup.exe
```

### Release Process

The repository includes two GitHub Actions workflows:

- `.github/workflows/build-desktop.yml`: runs on `push main` or manual dispatch and uploads platform artifacts.
- `.github/workflows/release.yml`: runs on `v*` tags, builds Windows/macOS/Linux packages, and creates a GitHub Release.

Typical release flow:

```bash
# Update package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json
# Add docs/releases/vX.Y.Z.md
npm test
npm run build
cd src-tauri && cargo check

# Commit, push main, then tag
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

### Security

- Do not commit real passwords, SSH keys, tokens, object-storage credentials, or local database files.
- Do not commit `node_modules/`, `dist/`, `src-tauri/target/`, or generated installers.
- Treat Redis, SSH, S3, MongoDB, and MySQL connection profiles as sensitive data.
- Redact hostnames, usernames, key paths, and credentials in screenshots, fixtures, and issues.

### Known Limits

- Redis Sentinel/Cluster, S3 lifecycle editing, and in-app auto-update are still roadmap items tracked in `PLAN.md`.
- MySQL currently targets common MySQL 5.7/8.0 workflows. MariaDB may work when protocol-compatible, but it is not the primary validation target.
- Large tables, buckets, or collections should be browsed with pagination, prefixes, or query filters rather than loading everything at once.

### Roadmap

The canonical roadmap is `PLAN.md`. Redis, SSH, S3, MongoDB, and MySQL main tracks are implemented; future iterations will continue improving import/export, update checks, database depth, and user experience.
