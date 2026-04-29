# DevNexus

DevNexus 是一个基于 **Tauri 2 + React + TypeScript** 的插件化桌面工具箱，面向日常开发与运维场景。

当前已实现：
- Redis 管理插件（连接管理、Key 浏览、控制台、服务器信息、导入导出）
- SSH 客户端插件（连接管理、多标签终端、密钥管理、隧道管理）
- S3 客户端插件（连接管理、Bucket 浏览、Object 浏览基础能力）

## 技术栈

- 桌面框架：Tauri 2（Rust）
- 前端：React 19 + TypeScript + Vite
- UI：Ant Design
- 状态管理：Zustand
- 数据存储：SQLite（rusqlite）

## 本地开发

### 1) 环境准备

- Node.js 20+
- Rust stable
- Tauri 运行前置依赖（按官方文档）

参考：
- https://www.rust-lang.org/tools/install
- https://tauri.app/start/prerequisites/

### 2) 安装依赖

```bash
npm install
```

### 3) 常用命令

```bash
# 前端开发
npm run dev

# 桌面应用开发模式
npm run tauri dev

# 前端构建
npm run build

# 测试
npm test

# 类型检查
npm run lint
```

## 打包

```bash
# 使用 Tauri 打包（当前平台）
npm run tauri build
```

示例：
- Windows: `npm run tauri build -- --bundles nsis`
- macOS: `npm run tauri build -- --bundles app,dmg`
- Linux: `npm run tauri build -- --bundles deb,appimage`

## CI/CD

仓库已内置跨平台构建工作流：
- `.github/workflows/build-desktop.yml`
- 支持 `workflow_dispatch`、`push main`、`tag v*` 触发
- 自动构建并上传 Windows/macOS/Linux 安装产物

## 项目结构

```text
src/          前端应用与插件
src-tauri/    Rust 后端与 Tauri 配置
tests/        前端测试
docs/         设计与文档
PLAN.md       开发计划与进度日志
```
