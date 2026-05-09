# Repository Guidelines

## Project Overview
DevNexus is a Tauri 2 desktop toolbox with a React 19 + TypeScript frontend and a Rust backend. It is organized as a plugin platform for developer and operations tools. The current product surface includes Redis Manager, SSH Client, S3 Browser, MongoDB Client, and MySQL Client.

Treat packaging, release notes, and `PLAN.md` progress updates as part of the deliverable when a task changes product behavior. This repository has repeatedly shipped through versioned GitHub Releases, so docs and release workflow compatibility matter as much as the code path.

## Project Structure & Module Organization
Frontend code lives under `src/`:
- `src/app/`: app shell, layout, plugin registry, shared app state.
- `src/plugins/`: plugin UIs and plugin-local stores/types/components/views.
- `src/styles/global.css`: global layout and visual behavior.

Rust/Tauri code lives under `src-tauri/`:
- `src-tauri/src/db/`: SQLite initialization and connection-profile repositories.
- `src-tauri/src/plugins/`: backend plugin modules, connection pools, and Tauri commands.
- `src-tauri/src/crypto/`: local encryption helpers for sensitive fields.
- `src-tauri/tauri.conf.json`: app metadata, window config, bundle targets, icons.

Documentation and release materials:
- `PLAN.md`: roadmap and live implementation progress. Keep it current during plan-driven work.
- `docs/releases/`: one release note file per version, named `vX.Y.Z.md`.
- `.github/workflows/`: desktop build and tag-triggered release workflows.
- `tests/`: Vitest tests, currently focused on app/plugin-registry behavior.

## Plugin Architecture
Each plugin should keep its frontend and backend concerns isolated:
- Frontend plugin root: `src/plugins/<plugin-id>/index.tsx` exports a `PluginManifest`.
- Frontend store/types/views: keep Zustand store, shared types, page views, and components inside the same plugin folder.
- Backend plugin root: `src-tauri/src/plugins/<plugin-id>/mod.rs` exposes `commands`, `types`, and any pool/session modules.
- Connection config repo: place SQLite CRUD for saved profiles in `src-tauri/src/db/<plugin>_connection_repo.rs`.
- Registration: add frontend plugins in `src/app/plugin-registry/builtin.ts`; add backend commands to `tauri::generate_handler!` in `src-tauri/src/lib.rs`.

Follow existing Redis, S3, MongoDB, and MySQL patterns before inventing new abstractions. The boring path is usually the right path here.

## Build, Test, and Development Commands
- `npm install`: install frontend and Tauri CLI dependencies.
- `npm run dev`: start the Vite frontend dev server only.
- `npm run tauri dev`: run the full desktop app in development mode.
- `npm run build`: run TypeScript checks and build the frontend bundle.
- `npm test`: run Vitest tests once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run lint`: run `tsc --noEmit` for type-only validation.
- `cd src-tauri && cargo check`: validate Rust backend compilation.
- `npm run tauri build -- --bundles nsis`: build the Windows installer.
- `npm run tauri build -- --bundles app,dmg`: build macOS bundles on macOS.
- `npm run tauri build -- --bundles deb,appimage`: build Linux bundles on Linux.

Expected non-blocking warnings at the time of writing:
- Vite may warn about chunks larger than 500 kB.
- Rust may warn that `RedisConnectionType` is unused.

## Coding Style & Naming Conventions
Use TypeScript modules with explicit types for shared interfaces and plugin contracts. React components and page views use `PascalCase.tsx`; stores and utilities use descriptive lowercase or kebab-case names such as `mysql-connections.ts` and `registry.ts`.

Rust modules use snake_case files and module names. Prefer small, focused modules: `commands.rs` for Tauri commands, `types.rs` for serializable DTOs, and `client_pool.rs`/`session_pool.rs` for long-lived backend resources.

Use existing Ant Design and Zustand patterns for UI and state. Avoid introducing new state libraries, custom component systems, or large styling frameworks unless the user explicitly asks for a redesign.

## Data, Security, and Secrets
Saved connection data is sensitive. Do not commit secrets, local databases, private keys, generated installers, `node_modules/`, `dist/`, or `src-tauri/target/`.

Sensitive profile fields should be encrypted through the existing AES-GCM helper before being persisted in SQLite. This applies to Redis passwords, SSH credentials/passphrases, S3 secrets, MongoDB URIs/passwords, and MySQL passwords.

When adding fixtures, tests, screenshots, docs, or issue text, redact hostnames, usernames, access keys, private-key paths, and passwords.

## Testing Guidelines
Use Vitest for frontend and registry logic. Place tests under `tests/` mirroring the source area, and name files `*.test.ts` or `*.test.tsx`.

For meaningful frontend/Rust changes, run the reliable verification trio:
- `npm test`
- `npm run build`
- `cd src-tauri && cargo check`

For release or packaging tasks, also run the relevant Tauri build command for the target platform. Long Tauri builds can exceed default command timeouts; use a long timeout before treating them as failed.

## Release Workflow
The app version must stay synchronized across:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Every release should include `docs/releases/vX.Y.Z.md`. The tag-triggered release workflow reads release notes from `docs/releases/${{ github.ref_name }}.md`, so the filename must match the tag exactly.

Current workflows:
- `.github/workflows/build-desktop.yml`: builds Windows/macOS/Linux artifacts on `push main` or manual dispatch.
- `.github/workflows/release.yml`: builds platform packages and creates a GitHub Release when a `v*` tag is pushed.

Use concise annotated tags, for example:

```bash
git tag -a v0.5.0 -m "Release v0.5.0"
git push origin v0.5.0
```

If SSH push to GitHub is blocked by the network, HTTPS push with Git Credential Manager has worked in this environment.

## PLAN.md Expectations
When the user asks to develop from a plan or continue a phase, update `PLAN.md` during implementation, not only at the end. Keep entries grouped by date under `## 开发进度（实时）`. Use concrete records: what changed, what was verified, and what artifact was produced.

Do not mix progress from different dates under one heading. If a new phase begins, add a new phase section before the progress log and keep checkboxes aligned with the actual implementation state.

## Commit & Pull Request Guidelines
Recent history uses concise Conventional Commit-style subjects such as:
- `feat: add mysql client plugin`
- `feat: add mongodb client plugin`
- `ci: add v0.1.0 release workflow and notes`
- `docs: refresh readme`

Keep commit subjects imperative and scoped to one change. PRs should include a short description, test evidence, linked issues when applicable, and screenshots for visible UI changes. Note platform-specific packaging impact for Tauri changes.

## Practical Development Notes
- Prefer `rg` for searching files and text.
- Do not revert unrelated dirty changes unless explicitly asked.
- Prefer `apply_patch` for targeted edits and generated scripts only when they are clearly faster and safe.
- For frontend UI work, preserve the current DevNexus visual system unless the task is explicitly a redesign.
- For database tools, avoid unbounded loads. Use pagination, cursors, prefixes, limits, and explicit user confirmation for dangerous operations.
- For terminal/SSH work, avoid spawning visible console windows unless the user explicitly asks for an external terminal.
