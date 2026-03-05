All 12 tasks verified and completed. Here's the summary of every P0-P1 item with runtime proof:

---

## Verification Results

### P0 -- Critical Bugs (all fixed and verified)

| Task | Status | Evidence |
|------|--------|----------|
| **P0-1** Config in project root | PASS | `ui8kit.config.json` created at `.test-app/ui8kit.config.json` (root), NOT in `src/`. Old location `src/ui8kit.config.json` does not exist. |
| **P0-2** Case-insensitive search, exclude variants/lib | PASS | `add Button` (capital B) resolves correctly. `add utils` returns "not found" (lib type excluded). |
| **P0-3** Install clsx + tailwind-merge | PASS | After `init -y`, `package.json` contains `"clsx": "^2.1.1"` and `"tailwind-merge": "^3.5.0"`. |
| **P0-4** Real preflight checks | PASS | Running `add` from `/tmp` (no package.json) returns clear error: "No package.json found in the current directory." |
| **P0-5** Automatic CDN fallback | PASS | `retry-api.ts` deleted. `api.ts` has `fetchJsonWithRetry` with configurable `maxRetries` (default 1, `--retry` sets 3), 10s timeout, automatic CDN fallback across all 3 CDNs. |

### P1 -- Important Enhancements (all implemented and verified)

| Task | Status | Evidence |
|------|--------|----------|
| **P1-1** Init prompts (2 questions only) | PASS | `init.ts` prompts only `globalCss` and `aliasComponents`. TypeScript hardcoded to `true`, framework to `vite-react`. `configSchema` includes `globalCss` field. |
| **P1-2** Typed error system | PASS | `src/utils/errors.ts` has `Ui8kitError`, `RegistryNotFoundError`, `ConfigNotFoundError`, `RegistryFetchError`, `ConfigParseError`, `NetworkError` with `suggestion` field. `handleError()` handles Zod errors too. |
| **P1-3** Interactive multiselect | PASS | `add.ts` `pickComponentsFromPrompt()` shows grouped multiselect when no components specified. Excludes variants/lib types. |
| **P1-4** Extracted utilities | PASS | `src/utils/package-manager.ts` contains `detectPackageManager()`, `installDependencies()`, `installDependenciesIndividually()`. `src/utils/logger.ts` has `info/success/warn/error/debug` levels with verbose gating. |
| **P1-5** Global `--cwd` flag | PASS | `--cwd .test-app` from CLI root correctly resolves config and runs commands. `scan` and `build` no longer have their own `--cwd`. |
| **P1-6** Verbose mode | PASS | `-v` flag shows debug messages like `Loading button from /components/ui/`. Normal mode shows clean output (spinners + results only). |
| **P1-7** Registry deps resolution | PASS | `src/utils/dependency-resolver.ts` implements recursive DFS with Kahn's topological sort, deduplication, and circular dependency detection with warnings. |

### Build Quality

- **Build**: Clean, 79.62 KB output
- **Type-check**: Zero errors
- **Linter**: Zero errors across all 10 modified/new files
- **Version**: Bumped to 1.2.0