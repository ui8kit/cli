# Changelog

## [1.2.1] - 2026-03-05

### Added
- Global flags: `--cwd` and `--verbose` are now available at CLI root level and apply to all commands.
- `init` prompts now only ask for:
  - global CSS path (`globalCss`, default `src/index.css`)
  - component alias (`aliasComponents`, default `@/components`)
- `add` now opens an interactive multiselect when no components are provided.
- New P2 commands:
  - `list` for listing registry components (with optional `--json`)
  - `diff` for local-vs-registry file comparison and unified diff output
  - `cache clear` for wiping local registry cache
- Added filesystem registry cache at `~/.ui8kit/cache/` with default TTL `1h`
- Added import alias transform pipeline during install (`transformImports`, `transformCleanup`) for `.ts`/`.tsx` files

### Changed
- `init` now hardcodes `typescript: true` and `framework: vite-react`.
- Logging is standardized through the centralized logger with verbose debug mode.
- Error handling is routed through typed errors and centralized `handleError`.
- `README.md` updated with new prompts and global options behavior.
- `add --dry-run` now prints full install paths, overwrite/create status, dependency checks, and file-level diff preview for existing files.
- Registry fetch flow now supports `--no-cache` at root command level for bypassing filesystem cache.

### Fixed
- `add` now resolves registry dependencies with recursive ordering (`registryDependencies`) and deduplication.
- Global `--cwd` now correctly changes working directory before command action execution.
- Command-level runtime flow for `scan` / `build` / `add` now respects root-level `--cwd` consistently.
- P2 `diff` flow is now available to detect local component updates against registry snapshots.

## [Unreleased]

### Unchanged
- No pending changes at the moment.

## [1.2.0] - 2026-03-05

### Fixed
- Completed remaining P1 CLI improvements and stabilized trial run against `.test-app`.
- Added a full trial report in `REPORT.md` for `init`, `add`, `scan`, and `build` commands.

