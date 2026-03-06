# Backlog — Next Iteration

## Priority Checklist

### P1 — Add registry cleanup command
- [ ] Define command UX and naming
  - Choose command name and placement, e.g. `ui8kit registry clear` or `ui8kit registry clean`.
  - Confirm scope:
    - remove generated build registry files,
    - remove root/source registry manifests currently tracked by CLI,
    - preserve source code and user configuration.
- [ ] Add command implementation
  - Add CLI command definition and option parsing.
  - Support dry-run mode (preview paths to be deleted).
  - Support `--force` to skip confirmation when non-interactive.
  - Support `--all` to remove both current `registry.json` and build output artifacts.
- [ ] Implement safe deletion logic
  - Resolve project paths relative to active working directory.
  - Validate candidate paths before deletion.
  - Handle missing files/folders as success with explicit “already clean” notice.
  - Print clear summary: removed files count + removed paths.
- [ ] Add tests
  - Unit test: path resolution and deletion decision logic.
  - E2E test: command removes expected files and reports no-op when nothing exists.
  - Error test: unreadable path and permission-restricted path produce actionable error.
- [ ] Update documentation
  - Add command entry to CLI usage docs.
  - Document non-interactive mode and safety guarantees.

Acceptance criteria:
- Command completes with stable exit code and clear messages.
- No accidental deletion outside registry-related paths.
- Command works in empty workspace (idempotent behavior).

---

### P2 — Generate `ui8kit.map.json` from `utility-props.map`
- [ ] Analyze current map source format
  - Locate how `utility-props.map` is produced and consumed in the build path.
  - Define the transformation contract from `utility-props.map` → `ui8kit.map.json`.
- [ ] Implement map generation step
  - Add transformation module with deterministic ordering and stable key normalization.
- [ ] Ensure output placement and integration
  - Define output location (project root or build directory).
  - Integrate generation into existing build pipeline.
  - Add `--watch`/`--dry-run` behavior if build pipeline already supports it.
- [ ] Add validation and fail-fast behavior
  - Validate input map shape before writing output.
- [ ] Add tests
  - Unit test transformation function with representative fixtures (normal, empty, malformed input).
  - E2E test: running build creates `ui8kit.map.json` with expected structure.
- [ ] Update docs
  - Add schema/shape description for generated map.
  - Describe how to consume the map in downstream tooling.

Acceptance criteria:
- Running build pipeline produces `ui8kit.map.json` by default.
- Output is reproducible and JSON-valid across environments.
- Invalid input map fails with clear actionable diagnostics.

---

### P3 — Add full reset command for clean reinstallation
- [ ] Define reset workflow and command UX
  - Decide command name and placement, e.g. `ui8kit reset` (or `ui8kit purge`).
  - Define reset scope as: complete local CLI state cleanup to allow re-running `init` and `add` from a blank state.
- [ ] Specify what is removed
  - `ui8kit.config.json` in project root.
  - Components produced by `add` (files and directories declared in generated registry manifest).
  - Registry artifacts handled by `build` and metadata used by scanner/diff.
  - CLI-specific temporary build metadata in project-local scope.
  - Optional: include cache clean-up via explicit flag (`--with-cache`), separate from registry/component data cleanup by default.
- [ ] Implement safe and predictable deletion
  - Add explicit discovery pass and confirm resolved paths before deletion.
  - Implement safety guards for path traversal and deletion outside project workspace.
  - Support:
    - `--yes` for non-interactive usage,
    - `--dry-run` preview mode,
    - `--force` to skip prompts.
  - Keep reset idempotent when no files are present.
- [ ] Link to existing cleanup capabilities
  - Reuse path resolver and deletion primitives from `registry` cleanup logic to avoid divergence.
  - Ensure behavior is consistent with `cache clear` and future `registry clean`.
- [ ] Add tests
  - Unit test: complete reset path list and safety checks.
  - E2E test: run `init`, run `add`, then `reset`; verify project returns to clean state and `init` works without conflicts.
  - E2E test: `reset --dry-run` output is explanatory and performs no mutations.
  - E2E error test: non-writable directories fail with clear guidance.
- [ ] Update docs
  - Add reset command documentation with “before/after clean state” use case.
  - Mention interaction with `init`/`add` in migration and troubleshooting guides.

Acceptance criteria:
- Running `ui8kit reset` removes all active local CLI installation artifacts.
- After reset, `init` and `add` can be executed again from a clean state without manual cleanup.
- No user code is removed beyond explicitly intended `ui8kit` state.

---

### P4 — Add configurable CDN URL strategy for init/build/diagnostics
- [ ] Add explicit CDN configuration in project config
  - Extend `ui8kit.config.json` schema with `registryUrl` (single base URL) and optional `registryVersion` / `registryUrls` overrides.
  - Add validation and graceful fallback to existing `cdnBaseUrls` defaults.
  - Document precedence: explicit CLI flag > project config > built-in defaults.
- [ ] Define CDN provider priority for defaults
  - Reorder default `cdnBaseUrls` to try `https://unpkg.com/@ui8kit/registry@latest/r` first, then `https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r`.
  - Keep GitHub fallback as a last resort.
  - Add rationale in config docs that unpkg normalizes `@latest` to the latest concrete version automatically.
- [ ] Add CLI option for one-off CDN override
  - Add `--registry-url` and/or `--registry-version` option to `init` (and optionally `add`, `list`, `diff`) to force runtime CDN source.
  - Accept either full base URL (`https://cdn.jsdelivr.net/npm/@ui8kit/registry@1.5.1/r`) or versioned shortcut (`@latest`/`@1.5.1`).
  - When a version is passed (`--registry-version 1.5.1` or config value), replace `@latest` with `@1.5.1` in every built-in CDN base URL before fetch.
  - Ensure `installVariantsIndex`/`installCoreFiles` use resolved CDN URL order consistently.
- [ ] Add hard override mode for registry resolution
  - If URL is explicitly configured, always prioritize it when loading `index.json`, `components/variants/index.json`, and variant/lib components.
  - Keep fallback order to existing CDN providers only when `--strict-cdn`/`ui8kit.config` is not enabled.
- [ ] Add diagnostics helper command
  - Add `ui8kit info --cdn`/or dedicated command output that prints resolved CDN URL order and active overrides.
- [ ] Add integration tests for resolution order
  - Test config-driven override is used for index fetch and variant index sync.
  - Test CLI override flag bypasses `latest` defaults and respects explicit URL.
  - Add failure test that logs actionable message and falls back to next provider when non-strict mode is set.
- [ ] Update docs and release notes
  - Add a section to README: how to pin CDN URL/version for `latest` cache sensitivity and deterministic installs.
  - Add troubleshooting note for stale `@latest` behavior and cache invalidation.

Acceptance criteria:
- `init` can be run repeatedly and pulls variants from forced CDN URL.
- `@latest` behavior remains default when no override is provided, with `unpkg` checked before `jsdelivr`.
- Explicit URL/Version overrides are persisted in `ui8kit.config.json` and can be used in CI pipelines.

---

### P5 — Add script to validate current CDN payloads from local repo
- [ ] Add `./scripts/get-cdn.js` script
  - Discover `cdnBaseUrls` from source config files (at least `src/utils/schema-config.ts`).
  - Print resolved URLs for:
    - `r/components/variants/index.json`
    - `r/components/ui/Button.json`
    - (and optional extras passed via CLI args).
  - Fetch each URL and print HTTP status + short content summary (status/size/etag/last-modified).
- [ ] Add script usage docs in README
  - Include command examples for checking `latest` and version-pinned URLs.
  - Explain how to use it before `ui8kit init` if CDN appears stale.
- [ ] Add tests for script parsing and URL assembly
  - Unit-test extraction of `cdnBaseUrls` from representative config content.
  - Add fixture test for malformed / commented URL blocks.

Acceptance criteria:
- One command can verify CDN payload freshness without running full CLI.
- The script can force-check a versioned URL and report divergence from `@latest`.

## Notes
- Keep changes limited to CLI and build pipeline safety first.
- Pair each task with at least one integration test to prevent regressions.
