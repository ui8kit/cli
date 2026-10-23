# Changelog

## [Unreleased]

## [3.1.1] - 2026-10-23

### Changed
- `ui8kit.lock.json` **lockVersion 2**: item key = registry identity + runtime + name, independent of CDN host and version. unpkg / jsDelivr npm URLs → `npm:<package>` (`npm:@ui8kit/registry|react|button`); other hosts → `host/path` without version segments (brand registries stay separate). `source` (URL used) and exact `version` remain fields. A CDN fallback no longer creates a second entry.
- `check` groups mixed versions / rules drift by registry identity.
- lockVersion 1 files are migrated on read (re-keyed, duplicates keep the newest version) and written as v2.

### Docs
- README: developer section (lock, `check` in CI, `check --adopt`, error meanings and fixes, CRLF, version pinning, brand registries + `meta.primitives`, primitives are not forked). AGENTS.md: rules for agents working in ui8kit apps.

## [3.1.0] - 2026-10-23

### Added
- `ui8kit.lock.json`, written by `init` (utils, rules) and `add`: `lockVersion` 1, CLI version, items keyed `base|name` with type, source registry base, exact version (item `digest`, else index `version`; never a range), runtime and `files` (posix path → sha256 of the written content, CRLF normalized). Merged on repeated runs; sorted, deterministic output.
- `ui8kit check`: offline verification — missing files, modified files (hash mismatch; may also come from changed `aliases` / `importStyle` / `paths`), mixed primitive versions from one source, agent rules version vs primitives. `--json`; exit code 1 on errors.
- `ui8kit check --adopt`: creates/extends the lock for an existing install by fetching registry items and hashing the expected content; only matching files are adopted, mismatches are reported.

### Changed
- One shared install plan (runtime filter → install path → import transforms / rules substitution) for `init`, `add` and `check`. `init` now applies the same import transforms to utils as `add` (normalizes trailing blank lines) and checks every write stays inside the project.

## [3.0.2] - 2026-10-23

### Changed
- Config `$schema` and generated registry `$schema` point at `https://cdn.jsdelivr.net/npm/@ui8kit/registry@3/schema/` (`schema.json`, `registry.json`, `registry-item.json`) instead of `ui.buildy.tw`.
- `--help`, messages and schema descriptions describe 3.x: `npx ui8kit@3`, per-runtime registry, legacy templ/latte/twig/jinja2 via `--registry-version 2.0.0`; no manual-download hint.
- `registry:rules` `{kit}` default (`meta.kitTarget` missing) is `ui`.
- `get-cdn` script probes the 3.x per-runtime paths (`--runtime`, `--registry-version`).
- README, AGENTS.md and docs rewritten for 3.x; new `docs/migration-v3.md`.
- package metadata: author UI8Kit, webcomponent keyword, legacy stacks marked.
- CI: `main` only; added a Windows job (Node 22).

### Deprecated
- `--import-style package` (`@ui8kit/core` imports): still works, prints a warning.

### Removed
- Unused registry-validator helpers (`isUtilityRegistryInitialized`, `canUseRegistry`, `getUtilityComponents*`, `showUtilityComponentsSummary`).

## [3.0.1] - 2026-10-23

### Changed
- Default registry CDNs use the CLI's own major range instead of `@latest` (ui8kit 3.x → `@ui8kit/registry@3`, derived from the package version). `--registry-version` / `registryVersion` still override (exact `3.0.0`, range, or dist-tag such as `canary`). Not pinned by default; `init` does not force pinning.
- Removed the `raw.githubusercontent.com/ui8kit/core/refs/heads/main` fallback (unversioned branch of another repo).
- `list` and `diff` read `registryUrl`, `registryVersion`, `runtime`, `strictCdn`, `cdnBaseUrls` from `ui8kit.config.json` like `add` (flags win).
- Cache scope (disk and in-memory index) includes the resolved registry bases (URL, version, runtime folder) and runtime.

### Added
- URL `registryDependencies`: bare-name deps of an item fetched by URL resolve against that item's registry base (strict, no fallback); dependency-tree keys are `base|name`, so same-named items from two registries no longer collapse. Requested URLs are no longer reported as "not found".
- `build` copies top-level registry `meta` (and `registry`) into `index.json`, e.g. brand `meta.primitives { registry, version }`.

## [3.0.0] - 2026-10-23

### Added
- Per-runtime registries (digest >= 3.0.0): with `registryVersion` 3+ and a runtime, the default CDN bases resolve to `…/r/<runtime>` (an explicit `--registry-url` is used as-is).
- Item type `registry:rules` (registry folder `rules/`): `init` installs it into the app root (`.cursor/rules/…`), substituting only `{kit}` (primitives folder, from `meta.kitTarget` + `dir`/`paths.ui`) and `{globs}` (`meta.globs` prefixed with `dir`). Hidden from `add`/`list`.
- Runtime/framework `webcomponent`: `--runtime webcomponent` installs `*.wc.ts` + shared files (`*.wc.ts` stays excluded from react/solid/svelte/vue).

### Changed
- `init` and `add` no longer scaffold empty kit folders (`blocks/`, `layouts/`, `lib/`, …): only folders of files actually written are created.

### Fixed
- **Security:** registry file targets/paths that are absolute or contain `..` are rejected, and every write is checked to stay inside the project directory.
- Unknown `--runtime` (add/init) or `--framework` (init) now fails with an error instead of installing every runtime / silently falling back to `none`.
- `build` writes `registry.json` `version` into `r/index.json` (was hard-coded `1.0.0`).
- `init` "Next steps" and `add` examples no longer mention a non-existent `card` component.

## [2.0.4] - 2026-10-17

### Fixed
- **`ui8kit --version` (and `info`) printed the wrong version**: `0.0.0` under `npx` (the npx cache manifest has no version) and the consumer project's own version when run through `node_modules/.bin/ui8kit`. The version is now read from the CLI's own module directory first, then from the symlink-resolved entry script, and only a `package.json` named `ui8kit` is accepted. Tests cover the npx cache layout, a bin symlink inside a project with its own `package.json`, and a direct run.
- Tests: the bin-symlink case falls back to a directory junction on Windows when a file symlink is not permitted (EPERM without SeCreateSymbolicLinkPrivilege).

### Chore
- `package-lock.json`: esbuild pinned back to 0.27.7 (`@esbuild/*`).
- Removed stray empty `cache` / `clears` files from the repo root and ignored them; `.gitattributes` forces LF; README/package keywords list all runtimes (incl. Twig, Latte, Jinja2).

## [2.0.3] - 2026-10-17

### Fixed
- **Single-runtime items were sliced by the multi-stack file rules** (`--runtime` / `config.runtime`, which `init --framework <rt>` sets): an item whose own `runtime` equals the requested runtime is now installed in full. Before, `add` against a per-runtime registry dropped every Solid view (`*.tsx` does not match the `*.solid.tsx` rule: `skip button (no files for runtime solid)`, blocks installed only their `*.types.ts`) and dropped files of templ/Twig/Latte items that match no rule (`ui/lucide-icon/lucide_icons.go`: templ build error `undefined: lucide`; `lucide-icons.json`). Multi-stack items (no item-level `runtime`) keep the 2.0.2 rules.

### Added
- **`jinja2` runtime / framework**: accepted by `init --framework`, `--runtime`, `config.runtime` and the registry item schema (`runtime: "jinja2"` was rejected by 2.0.2). File rule for multi-stack items: `*.j2`, `*.html.j2`, `*.jinja`, `*.jinja2`.
- `isKnownRuntime` reads the `RUNTIMES` list (one source of truth).

### Docs
- `docs/commands.md`, `docs/registry-format.md`, `docs/configuration.md`, `docs/concepts.md`, `docs/scenarios/non-js.md`: jinja2, single-runtime items, targets of the server-template runtimes. No contract change (`contractVersion` stays `2.0.0`: additive enum value).

## [2.0.2] - unreleased

Registry gap fixes found while validating per-runtime registries (`r/<runtime>/`) with the real CLI.

### Fixed
- **Runtime filter dropped type files** (`--runtime` / `config.runtime`): `*.types.ts`, `*.types.tsx` and `*.d.ts` are now always kept, and so is every file of the same item that a kept file imports (relative imports, transitively, extension/`index` resolution). A file imported by a selected file is never dropped. No more `init --framework none` workaround.
- **`registry:utils` / `registry:lib` not resolved through `registryDependencies`** (`Component utils not found in ui registry, skipping`): `utils`, `utils/<name>`, `lib/<name>` (and bare lib names in `index.json`) resolve against their own endpoints (`utils/utils.json`, `lib/presets.json`) and are installed by `add` when missing. Catalog exclusion (picker, `--all`) is kept; explicit names and dependencies are no longer filtered. Dependency-only utils/lib never overwrite existing files, even with `--force`. `ui8kit add utils` now works.
- **`paths` ignored when a registry file sets `target`**: precedence is now `--path key=dir` flag > `config.paths` mapped by target prefix > file `target` (documented in `docs/configuration.md`). Behaviour is unchanged when no `paths`/`--path` apply.
- **Dependency cycles** (type-only imports, e.g. `feature-grid` ↔ `feature-cards`): no more `Circular registry dependency` / `Unresolved dependency cycle` warnings. Each item is installed once and back edges no longer disturb install order. `--verbose` lists type-only edges; a cycle made only of value imports gets one concise warning.
- Registry item cache is now namespaced per `--registry-url`, so two registries (e.g. per runtime) no longer return each other's cached items.

### Added
- `add --path <key=dir>` (repeatable) to override install folders for one run.
- `logger.verbose` (informational lines shown only with `--verbose`).
- Tests with a generated synthetic fixture registry (`tests/fixtures/build-fixture-registry.mjs`) and an end-to-end script `npm run test:e2e` (`scripts/e2e-fixture-registry.mjs`, init/add for svelte and react).

### Docs
- README, `docs/commands.md`, `docs/configuration.md`, `docs/registry-format.md`, `docs/troubleshooting.md`: runtime filter, utils/lib resolution, cycles, `paths` precedence.

## [2.0.1] - 2026-08-11

### Added
- **Runtime file filter** on `add`: `--runtime` / `config.runtime` keeps only matching stack files plus shared assets (`*.shared.ts`, `*.variants.json`). Item-level `runtime` skip is unchanged.
- File rules: `react` → `*.tsx` (not `*.solid.tsx`); `solid` → `*.solid.tsx`; `svelte` / `vue` / `latte` / `twig` by extension; `templ` → `*.templ` + `*_templ.go` / `*_gen.go`. `registry:utils` / `lib` / `variants` are never sliced.

### Docs
- README, commands, multi-runtime scenario, and registry-format updated for file-level filtering.

## [2.0.0] - 2026-08-11

### Breaking
- Multi-runtime contract **2.0.0**: `framework` is `react` | `svelte` | `vue` | `solid` | `templ` | `latte` | `twig` | `none` (no `vite-react`).
- Install root is `dir` + canonical folders (`lib`, `utils`, `components/ui`, …) with optional `paths` remap.
- File install preserves nested `target` / path structure (no basename flatten).
- `init` no longer requires Vite + React; supports `--framework`, `--dir`, `--skip-core`.

### Added
- Config: `contractVersion`, `runtime`, `cdnBaseUrls`, `strictCdn`.
- Registry types: `registry:utils`, `registry:widget`.
- MIT `LICENSE`, publish scripts (`prepublishOnly`, `pack:check`), shebang via tsup banner.
- CDN probe defaults include `index.json` and utils paths.

### Changed
- Package metadata, README, and maintainer scripts aligned for npm publish of the universal CLI.
- Removed utility-map pipeline (`utility-props.map.ts` → `ui8kit.map.json`) — CLI no longer embeds kit-specific class-map generation.
- Dropped hardcoded `cn`/clsx stub on `init` when registry is unreachable; core files come only from registry items.
- Use Node built-in `fetch` (removed `node-fetch`).
- Slim runtime deps to `commander`, `prompts`, `zod` only; TypeScript moved to `devDependencies`.
- Replaced `chalk` / `ora` / `fs-extra` / `glob` / `execa` / `diff` with Node built-ins + thin `src/utils` helpers (`fs`, `walk`, `logger` Spinner, `diff-utils`).
- `build` is registry artifact assembly only (no schema JSON codegen / AST utility-map side effects).
- Engines / CI: Node `>=20` (Vitest 4 / rolldown need `util.styleText`; Node 18 dropped from matrix).

## [1.5.2] - 2026-03-09

- Updated scripts & cdn link to `raw.githubusercontent.com/ui8kit/core`

## [1.4.2] - 2026-03-08

### Changed
- Refactored utility map generation to use config-driven sources in `SCHEMA_CONFIG`
  and emit a deterministic flat `map: string[]` in `ui8kit.map.json`:
  `version`, `generatedAt`, and a class array.
- Added support for extracting runtime-aware class expansions from
  `src/lib/utility-props.ts` (for `flex` direction values and semantic `gap`
  aliases) while keeping the map wrapper shape stable.

## [1.4.1] - 2026-03-07

### Added
- Added import style configuration for component installation:
  - `--import-style` command option in `init` (`alias` default, `package` optional).
  - Support for package-style rewrites (`@ui8kit/core`) when `importStyle` is set to `package`.
- Added automatic dependency metadata flow from registry artifacts into installation paths (npm deps and registry dependencies), including `--all` and nested component installs.

### Changed
- Moved creation of base project directories from `init` to bulk install flow in `add --all`.
- `init` now focuses on config/core bootstrap and does not pre-create empty `blocks`, `layouts`, or `variants` directories.
- `add --all` now ensures all required install directories exist before writing files.

### Fixed
- Prevented unnecessary empty directories from appearing after `init` when only targeted component installs are required.
- Improved `--all` install consistency by normalizing install directory preparation before component writes.

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