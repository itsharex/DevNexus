# Repository Guidelines

## Project Structure & Module Organization
This repository is currently unscaffolded (no source, tests, or build files yet). Keep the root minimal and introduce code with a predictable layout:

```text
src/        application code
tests/      automated tests (mirrors `src/`)
assets/     static files (images, fixtures, sample data)
docs/       design notes and contributor documentation
```

Organize by feature or module, not by file type alone. Prefer small, focused modules with clear responsibilities.

## Build, Test, and Development Commands
No build or test toolchain is configured yet. When adding one, expose consistent commands and document them in `README.md`.

Suggested baseline:

- `npm run dev` start local development mode
- `npm run build` create production build artifacts
- `npm test` run automated tests
- `npm run lint` run static analysis/format checks

If you introduce a different stack (for example Python or Java), provide equivalent commands with the same intent.

## Coding Style & Naming Conventions
Use UTF-8 text, LF line endings, and end files with a trailing newline. Follow language-standard formatters (for example `prettier`, `black`, or `gofmt`) instead of manual formatting.

- Directories: `kebab-case`
- JavaScript/TypeScript files: `kebab-case` or `camelCase` (stay consistent per package)
- Classes/components: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

## Testing Guidelines
Place tests in `tests/` and mirror the `src/` structure. Name tests with clear intent, such as `cart-service.test.ts` or `test_cart_service.py`.

Minimum expectation for each change:

- Add or update tests for changed behavior
- Cover success path, failure path, and key edge cases
- Ensure tests run locally before opening a PR

## Commit & Pull Request Guidelines
There is no existing git history in this directory yet, so adopt Conventional Commits from the start:

- `feat: add order total calculation`
- `fix: handle empty cart input`
- `docs: update contributor guide`

PRs should include:

- concise description of what changed and why
- linked issue/task (if available)
- test evidence (command + result summary)
- screenshots or logs for UI/behavioral changes

## Security & Configuration Tips
Never commit secrets. Keep local values in ignored files (for example `.env`) and commit only safe templates (for example `.env.example`).
