# Repository Guidelines

## Project Structure & Module Organization
DevNexus is a Tauri 2 desktop toolbox with a React 19 + TypeScript frontend and Rust backend. Frontend code lives in `src/`: app shell and shared registry code are under `src/app/`, plugin UIs are under `src/plugins/`, and global styles are in `src/styles/global.css`. Rust/Tauri code lives in `src-tauri/`, with backend plugin modules under `src-tauri/src/plugins/`, database code in `src-tauri/src/db/`, and app icons/config in `src-tauri/icons/`, `src-tauri/tauri.conf.json`, and `src-tauri/capabilities/`. Tests live in `tests/`, currently organized by feature area such as `tests/app/plugin-registry/`.

## Build, Test, and Development Commands
- `npm install`: install frontend and Tauri CLI dependencies.
- `npm run dev`: start the Vite frontend dev server only.
- `npm run tauri dev`: run the full desktop app in development mode.
- `npm run build`: run TypeScript checks and build the frontend bundle.
- `npm test`: run Vitest tests once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run lint`: run `tsc --noEmit` for type-only validation.
- `npm run tauri build -- --bundles nsis`: build a Windows installer; adjust bundle targets per platform.

## Coding Style & Naming Conventions
Use TypeScript modules with explicit types for shared interfaces and plugin contracts. React components and view files use `PascalCase.tsx`; stores, registries, and utilities use kebab-case or descriptive lowercase names such as `ssh-connections.ts` and `registry.ts`. Keep plugin-specific types, stores, components, and views inside that plugin directory. Rust modules use snake_case files and module names. Prefer existing Ant Design, Zustand, and Tauri patterns before adding new abstractions.

## Testing Guidelines
Use Vitest for frontend and registry logic. Place tests under `tests/` mirroring the source area, and name files `*.test.ts` or `*.test.tsx` as appropriate. Test plugin registration, routing, store behavior, and data transformation logic. Run `npm test` before opening a PR; run `npm run build` when changing TypeScript types or build configuration.

## Commit & Pull Request Guidelines
Recent history uses concise Conventional Commit-style subjects such as `feat: add ...`, `ci: add ...`, `docs: refresh ...`, and `refactor: rename ...`. Keep commit subjects imperative and scoped to one change. PRs should include a short description, testing performed, linked issues when applicable, and screenshots for visible UI changes. Note any platform-specific Tauri packaging impact.

## Security & Configuration Tips
Do not commit secrets, local database files, generated installers, `node_modules/`, `dist/`, or `src-tauri/target/`. Treat saved Redis, SSH, and S3 connection data as sensitive when creating fixtures or screenshots.

