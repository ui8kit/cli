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

Options:

- `-a, --all` Install all available components
- `-f, --force` Overwrite existing files
- `-r, --registry <type>` Registry type (default: `ui`)
- `--dry-run` Show planned actions without writing files
- `--retry` Enable retry logic for unstable connections

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
