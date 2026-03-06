# Changelog

## [1.3.8] - 2026-03-06

### Added
- Added configurable CDN override strategy for command execution via config and flags (`registryUrl`, `registryVersion`, `strictCdn`) across `init`, `add`, `list`, and `diff`.
- Extended CDN diagnostics with `--cdn` in `info` to expose resolved CDN order, active overrides, and working CDN cache state.
- Added registry artifact cleanup command `registry clean` with `--dry-run`, `--force`, and `--all`.
- Added full local-state reset command `reset` with `--yes`, `--dry-run`, `--force`, and optional `--with-cache`.
- Added `get-cdn` diagnostics coverage and README documentation updates for cache/version troubleshooting workflows.
- Added `ui8kit.map.json` generation from `src/lib/utility-props.map.ts` into the `build` pipeline.
- Added TypeScript AST-based utility-map parsing and transformation tests.

### Changed
- Reordered default CDN base URLs to prefer `unpkg` before `cdn.jsdelivr.net`, then GitHub raw fallback.
- Improved registry cache handling in `build` by clearing cache before assembling artifacts.
- Updated command docs to describe new cleanup/reset workflows and CDN override examples.

### Fixed
- Fixed scanning of `variants/index.ts` re-export style entries using TypeScript AST export validation in the manifest pipeline.
- Fixed build collisions for synthetic `index` items by binding artifacts and synthetic variant entries by component identity (`name + type`).
- Fixed `build`/`scan` consistency for `components/index` and `components/variants/index` preservation in the generated registry index.

## [1.3.5] - 2026-03-06

### Added
- Added `info --json` output mode (`src/commands/info.ts`, `src/index.ts`) for machine-readable diagnostics.
- Added regression coverage for `scan`/`build` around variants index behavior (`tests/commands/scan.test.ts`, `tests/commands/build.test.ts`).
- Added practical roadmap and quality backlog documentation (`.project/IMPROVEMENT.md`, `.project/BACKLOG.md`, `.cursor/plans/refactor_variant_index_flow_ac7a81fe.plan.md`).
- Added `tests/README.md` documenting CLI test intent, execution strategy, and command coverage.

### Changed
- Improved CLI diagnostics path with JSON output and richer command coverage visibility via `info` command tests (`tests/commands/info.test.ts`).
- `build` now resets cache state before processing (`clearCache` + `resetCache`) to avoid stale artifacts during rebuilds.
- `build` now updates variants index artifacts by composite identity (`type + name`) to prevent collisions across component and variants index entries.
- `scan` now uses TypeScript AST validation for exports so re-export-based `variants/index.ts` variants are detected reliably.

### Fixed
- Fixed missing `registry:variants` `index` entry in scanned manifest when `src/variants/index.ts` uses only re-export syntax.
- Fixed dependency extraction for synthetic variants index to ignore false-positive local imports and parse external dependencies safely via AST.

## [1.2.2] - 2026-03-05

### Final
- Release status: Ready.
- Build and checks: `npm run build`, `npm run type-check`, and `npm run test` pass.

### Added
- `info` command for environment diagnostics (`ui8kit info`) including CLI version, runtime, config status, CDN and cache health.
- Progressive multi-component install feedback in `add` (`[n/total]` progress markers).
- Initial Vitest test suite scaffold in `tests/` for cache, transform, diff, dependency resolver, package manager, errors, logger, project, add, and init.

### Changed
- Extracted CLI version helper to `src/utils/cli-version.ts`.
- Added `vitest`/`@types/diff` tooling and `test` scripts.
- `add` dry-run output now consistently displays file-level context with progress position.

### Fixed
- `info` command coverage enables easier support troubleshooting.
- Added deterministic project setup checks in tests for `buildInitConfig` and `findConfig`.

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

## [1.2.0] - 2026-03-05

### Fixed
- Completed remaining P1 CLI improvements and stabilized trial run against `.test-app`.
- Added a full trial report in `REPORT.md` for `init`, `add`, `scan`, and `build` commands.

## [Unreleased]

### Unchanged
- No pending changes at the moment.