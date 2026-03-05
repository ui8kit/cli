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

When running without `--yes`, `init` now asks for:

- Global CSS file path (default: `src/index.css`)
- Import alias for components (default: `@/components`)

`typescript` is always set to `true` and `framework` is fixed to `vite-react`.

### `add`

Install one or more components from the registry.

```bash
bunx ui8kit@latest add button
bunx ui8kit@latest add button card
bunx ui8kit@latest add --all
bunx ui8kit@latest add badge --force
bunx ui8kit@latest add button --dry-run
bunx ui8kit@latest add --all --retry
```

Calling `add` without component arguments opens an interactive multiselect list grouped by component type.
Resolved registry dependencies are installed in dependency order automatically.
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
- `--retry` Enable retry logic for unstable connections
- `--no-cache` (root option) bypasses cache for this run.

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

Examples:

```bash
bunx ui8kit@latest diff button
```

### `cache`

Manage local registry cache.

```bash
bunx ui8kit@latest cache clear
```

Use `--no-cache` in any command to skip reading cached registry data.

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
