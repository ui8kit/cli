# ui8kit CLI

Official CLI for bootstrapping and managing UI8Kit component workflows in Vite React projects.

## Requirements

- Node.js `>=18`
- A Vite React project (for `init` and `add`)

## Quick Start

```bash
bunx ui8kit@latest init
```

Initialize with defaults (non-interactive):

```bash
bunx ui8kit@latest init --yes
```

## Commands

### `init`

Initialize UI8Kit structure and config in the current project.

```bash
bunx ui8kit@latest init
bunx ui8kit@latest init --yes
bunx ui8kit@latest init --registry ui
```

Options:

- `-y, --yes` Skip prompts and use defaults
- `-r, --registry <type>` Registry type (default: `ui`)
- `--registry-url <url>` Override registry CDN base URL
- `--registry-version <version>` Replace `@latest` in default URLs with a pinned version
- `--strict-cdn` Disable fallback CDN providers when an explicit URL is set
- `--import-style <alias|package>` Choose installed component import style (`alias` or package barrel `@ui8kit/core`; default: `alias`)

When running without `--yes`, `init` now asks for:

- Global CSS file path (default: `src/index.css`)
- Import alias for components (default: `@/components`)
- Import style for installed components (`alias` or `package`)

`typescript` is always set to `true` and `framework` is fixed to `vite-react`.
`init` now writes configuration and core utilities/variants. Empty category folders are created during bulk install (`add --all`).

### `add`

Install one or more components from the registry.

```bash
bunx ui8kit@latest add button
bunx ui8kit@latest add button card
bunx ui8kit@latest add --all
bunx ui8kit@latest add badge --force
bunx ui8kit@latest add button --dry-run
bunx ui8kit@latest add --all --retry
bunx ui8kit@latest --no-cache add button --dry-run
```

Calling `add` without component arguments opens an interactive multiselect list grouped by component type.
Resolved registry dependencies are installed in dependency order automatically.
`add` now prints progress counters for multi-component installs in the format `[n/total]`.
`--dry-run` now also shows:
- full target file paths
- overwrite/create status for each file
- registry dependency tree
- compact diff preview for files that already exist locally

Options:

- `-a, --all` Install all available components
- `-f, --force` Overwrite existing files
- `-r, --registry <type>` Registry type (default: `ui`)
- `--dry-run` Show planned actions without writing files
- `--all` also creates base install directories before fetching and writing components:
  - `src/lib`
  - `src/components`
  - `src/components/ui`
  - `src/blocks`
  - `src/layouts`
  - `src/variants`
- `--retry` Enable retry logic for unstable connections
- `--no-cache` (root option) bypasses cache for this run.
- `--registry-url <url>` Override registry CDN base URL
- `--registry-version <version>` Replace `@latest` in default URLs with a pinned version
- `--strict-cdn` Disable fallback CDN providers when an explicit URL is set

### `list`

List available components from the registry.
Grouped by component type and sorted alphabetically.

```bash
bunx ui8kit@latest list
bunx ui8kit@latest list --registry ui
bunx ui8kit@latest list --json
```

Options:

- `-r, --registry <type>` Registry type (default: `ui`)
- `--json` Print JSON output instead of table
- `--registry-url <url>` Override registry CDN base URL
- `--registry-version <version>` Replace `@latest` in default URLs with a pinned version
- `--strict-cdn` Disable fallback CDN providers when an explicit URL is set

### `diff`

Show differences between local components and registry versions using unified diff output.
Useful to check which installed components are outdated.

```bash
bunx ui8kit@latest diff
bunx ui8kit@latest diff button
bunx ui8kit@latest diff --json
```

Options:

- `[component]` Optional component name
- `-r, --registry <type>` Registry type (default: `ui`)
- `--json` Print diff summary as JSON
- `--registry-url <url>` Override registry CDN base URL
- `--registry-version <version>` Replace `@latest` in default URLs with a pinned version
- `--strict-cdn` Disable fallback CDN providers when an explicit URL is set

Examples:

```bash
bunx ui8kit@latest diff button
```

### `cache`

Manage local registry cache.

```bash
bunx ui8kit@latest cache clear
```

### `info`

Show local environment and configuration diagnostics.

```bash
bunx ui8kit@latest info
bunx ui8kit@latest --no-cache info
```

Use `--no-cache` in any command to skip reading cached registry data.

```bash
bunx ui8kit@latest info --cdn
```

Use `--cdn` to print resolved CDN URL order, active cache override, and registry override settings.

```bash
bunx ui8kit@latest --no-cache diff
bunx ui8kit@latest --no-cache list --json
```

### `registry` (utility)

Commands to maintain local CLI artifacts.

```bash
bunx ui8kit@latest registry clean
bunx ui8kit@latest registry clean --all --dry-run
```

### `reset`

Remove local UI8Kit-generated project state for a full clean re-install.

```bash
bunx ui8kit@latest reset
bunx ui8kit@latest reset --yes
bunx ui8kit@latest reset --dry-run
```

Options:

- `--dry-run` Show what will be removed
- `-y, --yes` Skip prompts
- `-f, --force` Skip confirmation prompt
- `--with-cache` Also clear local cache

Reset removes:

- `ui8kit.config.json` (project config)
- `src/registry.json` manifest if present
- Component install directories (`src/components`, `src/lib`, `src/variants`, `src/layouts`, `src/blocks`)
- Generated registry artifacts (`packages/registry/...`, `ui8kit.map.json`)

### `get-cdn` (diagnostics utility)

Check registry availability for each CDN source and compare payload metadata without touching installed project files.

```bash
npm run get-cdn
npm run get-cdn -- --url https://raw.githubusercontent.com/ui8kit/core/refs/heads/main/packages/registry/r
npm run get-cdn -- --path components/variants/index.json --url https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r
```

Use this before `init`/`add` when you suspect CDN propagation lag, stale `@latest` caches, or provider-specific outages.

### `scan`

Scan source files and generate a registry manifest.

```bash
bunx ui8kit@latest scan
bunx ui8kit@latest scan --source ./src --output ./src/registry.json
```

Options:

- `-r, --registry <type|path>` Registry type/path (default: `ui`)
- `-o, --output <file>` Output registry file
- `-s, --source <dir>` Source directory to scan

### `build`

Build a publishable registry from a registry JSON file.

```bash
bunx ui8kit@latest build
bunx ui8kit@latest build ./src/registry.json
bunx ui8kit@latest build ./src/registry.json --output ./packages/registry/r
```

Options:

- `[registry]` Path to registry JSON (default: `./src/registry.json`)
- `-o, --output <path>` Output directory (default: `./packages/registry/r`)

The build command also generates `packages/registry/ui8kit.map.json` when
`src/lib/utility-props.map.ts` is available.

Generated map shape:

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-03-06T12:00:00.000Z",
  "map": [
    "block",
    "display-block",
    "display-flex",
    "m-2",
    "m-4"
  ]
}
```

`map` keeps the existing top-level envelope, but the value is now a flat string
array of Tailwind classes. The generation reads both:

- `src/lib/utility-props.map.ts` — grouped whitelist map by utility prefix.
- `src/lib/utility-props.ts` — runtime rule source used for special
  expansions (for example `flex` direction handling and semantic `gap` aliases).

### Global options

These options work for all commands and are defined at the CLI root:

- `-c, --cwd <dir>` Working directory for command execution (default: current directory)
- `-v, --verbose` Enable verbose output including debug logs from registry/CDN operations
- `--no-cache` Bypass local filesystem cache for registry lookups

## Typical Flow

```bash
# 1) Initialize project
bunx ui8kit@latest init --yes

# 2) Add a component
bunx ui8kit@latest add button

# 3) Add everything from registry (optional)
bunx ui8kit@latest add --all
```

## Local Development (this package)

From `packages/cli`:

```bash
npm install
npm run dev
```

Build once:

```bash
npm run build
```

Run compiled CLI locally:

```bash
node dist/index.js --help
```
