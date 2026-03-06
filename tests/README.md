# Test Coverage for `ui8kit` CLI

This document describes the current test suite and what each test file validates.

## Test execution

- Run all tests:
  - `npm run test`
- Tests are located under `tests/**`.
- Unit tests are isolated and fast (`vitest`).
- `tests/commands/cli.test.ts` is an end-to-end layer and executes the built CLI binary (`dist/index.js`) via `node`.

## Test categories

### 1) End-to-end / CLI integration (`tests/commands/cli.test.ts`)

Validates real CLI entry points as a user would call them from the shell.

- `prints help from --help`
  - Verifies base help is printed and command list is available.
- `runs info command in an empty directory`
  - Ensures `info` works without project config and prints environment diagnostics.
- `runs scan and writes registry output`
  - Verifies `scan` creates a registry JSON from local source files.
- `runs build command and generates registry output`
  - Verifies `build` creates component artifact + registry index.
- `returns an error when build registry file is missing`
  - Verifies `build` exits with error when default registry path is absent.
- `creates an empty registry when scan source is missing`
  - Ensures empty scan input produces a valid empty `registry.items` output.
- `returns an error when build source file is missing`
  - Verifies `build` fails with a file-not-found diagnostic when referenced source files are absent.
- `shows help for scan command`
  - Confirms `scan --help` output.
- `shows help for init command`
  - Confirms `init --help` output.
- `shows help for add command`
  - Confirms `add --help` output.
- `shows help for diff command`
  - Confirms `diff --help` output.
- `shows help for list command`
  - Confirms `list --help` output.
- `shows help for cache command`
  - Confirms `cache --help` output.
- `returns cached list in JSON via CLI without network`
  - Verifies `list --json` can read from pre-seeded cache and returns JSON without external calls.
- `returns info diagnostics as JSON`
  - Verifies `info --json` prints machine-readable diagnostics and includes fields (`version`, `packageManager`, `cdn`).
- `shows no local components found for diff on empty project`
  - Verifies `diff` reports no local components and exits successfully.
- `removes cache files with a dedicated home directory`
  - Verifies `cache clear` removes data files from a controlled cache home.
- `idempotently clears cache when no cache directory exists`
  - Verifies `cache clear` succeeds even when cache is already absent.
- `returns an error for unknown command options`
  - Verifies command option validation surface and non-zero exit for invalid CLI options.
- `returns error for unknown commands`
  - Verifies invalid command path exits with code `1` and displays help hint.

### 2) Command unit tests

#### `tests/commands/add.test.ts`
- `maps component types to install targets`
  - Verifies `inferTargetFromType` type mapping.
- `resolves custom install directories`
  - Verifies `resolveInstallDir` with custom project dirs.

#### `tests/commands/diff.test.ts`
- `warns when no local components found`
  - Diff should warn and return early when no local files are detected.
- `detects up-to-date local components`
  - Diff output marks identical local/remote files as up-to-date.
- `detects changed local components`
  - Diff output identifies and reports updates.
- `supports JSON output format`
  - Verifies machine-readable JSON payload for diff.
- `warns when requested local component is missing`
  - Verifies warning path for missing component name argument.

#### `tests/commands/list.test.ts`
- `outputs JSON when requested`
  - Confirms `--json` branch returns serialized component list.
- `prints grouped and sorted output`
  - Verifies grouped by type output and deterministic ordering.
- `warns when no components are available`
  - Verifies warning behavior on empty registry dataset.

#### `tests/commands/info.test.ts`
- `prints diagnostics with local config`
  - Verifies pretty (`stderr/stdout`) diagnostics with existing `ui8kit.config.json`.
- `prints cache stats when config is missing`
  - Verifies missing-config behavior and diagnostic text.
- `outputs JSON when requested`
  - Verifies JSON output schema includes version, package manager, node version, and local config.

#### `tests/commands/scan.test.ts`
- `creates registry file from component sources`
  - Verifies scanner writes a registry file and detects valid component files.

#### `tests/commands/build.test.ts`
- `generates registry artifacts for each component`
  - Verifies generated component payload and `packages/registry/r/index.json`.

#### `tests/commands/cache.test.ts`
- `clears cache and prints summary`
  - Verifies cache clear command invokes cache removal and prints success.

### 3) Utility unit tests

#### `tests/utils/cache.test.ts`
- TTL behavior (`returns null for missing/expired cache`).
- Fresh cache retrieval and write/metadata generation.
- Full cache directory removal.
- `noCache` bypass behavior.

#### `tests/utils/dependency-resolver.test.ts`
- Resolves components with no dependencies.
- Topological sorting for dependency chains.
- Cycle-safe behavior.
- Duplicate request de-duplication.

#### `tests/utils/diff-utils.test.ts`
- Content difference detection.
- Unified diff generation.
- Diff preview truncation.

#### `tests/utils/errors.test.ts`
- `RegistryNotFoundError` content and suggestion.
- `ConfigNotFoundError` content and suggestion.
- `isZodError` detection path.

#### `tests/utils/logger.test.ts`
- Verbose suppression/enabled behavior for debug logs.

#### `tests/utils/package-manager.test.ts`
- Package manager detection from lockfiles.
- Fallback logic for npm when no lockfile is present.
- Detection from `packageManager` field in `package.json`.

#### `tests/utils/project.test.ts`
- Config resolution at project root.
- Backward-compatible config in `./src`.
- Null result when config is absent.

#### `tests/utils/transform.test.ts`
- Alias preservation for default config.
- Alias rewrite with custom alias mapping.
- Non-alias import behavior.
- CRLF cleanup.
- End-to-end `applyTransforms` + file transform detection.

## Notes on maintenance

- All tests use ASCII source comments and output text.
- `info` command now supports `--json`; integration and unit tests already cover it.
- Command coverage is intentionally split into:
  - Direct command-level unit tests with mocked dependencies.
  - CLI integration tests using compiled entrypoint to validate real invocation flow.
- If you add new CLI commands, add both:
  - A quick unit test for pure logic/handlers.
  - A small integration test in `tests/commands/cli.test.ts` for argument parsing/help path.
