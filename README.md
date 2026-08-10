# ui8kit CLI v2

Universal **shadcn-style** registry service: `init` / `add` / `list` / `diff` / `scan` / `build` — fetch registry items and **write files into your app** (not into `node_modules`). Tailwind sees classes. Works for React, Svelte, Vue, Solid, Go Templ, Latte/Twig — via `framework` / `runtime` + path contracts.

Contract version: **2.0.0**

**Full documentation (English):** [docs/README.md](./docs/README.md)

| Start here | |
|------------|--|
| [Getting started](./docs/getting-started.md) | Install + first init/add |
| [Commands](./docs/commands.md) | Complete CLI reference |
| [Scenarios](./docs/scenarios/) | React, Svelte, Templ, private CDN, publish, CI |
| [Registry format](./docs/registry-format.md) | Item / index JSON contract |

## Idea

```text
registry (CDN / digest)  →  npx ui8kit add  →  {dir}/components/ui/...
                                            →  {dir}/utils, lib, blocks, layouts, …
```

Codegen (separate) emits primitives; this CLI **installs** registry packages into app folders and can **scan/build** local registry artifacts for publishing.

## Requirements

- Node.js `>=20` (or Bun)
- A project with `package.json` (created by `init` if missing)
- **No** hard requirement for Vite/React

## Quick start

```bash
bunx ui8kit@latest init --yes --framework svelte --dir web/src
bunx ui8kit@latest add button --runtime svelte
```

Go / PHP apps (kit on disk for Tailwind / templ):

```bash
bunx ui8kit init --yes --framework templ --dir internal --skip-core
bunx ui8kit add button --runtime templ --registry-url https://example.com/r
```

## Canonical folders under `{dir}`

| Path | Role | Registry type |
|------|------|----------------|
| `lib/` | low-level runtime helpers | `registry:lib` |
| `utils/` | shared helpers (`cn`, …) | `registry:utils` |
| `components/` | composites | `registry:component` / `composite` |
| `components/ui/` | **primitives** (codegen digest) | `registry:ui` |
| `blocks/` | page sections | `registry:block` |
| `layouts/` | chrome / shells | `registry:layout` |
| `variants/` | variant maps | `registry:variants` |
| `widgets/` | UI + behavior | `registry:widget` |

Remap without breaking the contract:

```json
{
  "dir": "web/src",
  "paths": { "ui": "kit", "utils": "kit/utils" }
}
```

## Config (`ui8kit.config.json`)

```json
{
  "contractVersion": "2.0.0",
  "framework": "svelte",
  "runtime": "svelte",
  "typescript": true,
  "globalCss": "web/src/app.css",
  "dir": "web/src",
  "aliases": {
    "@": "./web/src",
    "@/ui": "./web/src/components/ui",
    "@/utils": "./web/src/utils"
  },
  "registry": "@ui8kit",
  "registryUrl": "https://cdn.example.com/ui8kit/r",
  "registryVersion": "0.1.0",
  "cdnBaseUrls": [
    "https://cdn.example.com/ui8kit/r"
  ],
  "strictCdn": true,
  "importStyle": "alias"
}
```

### CDN resolution order

1. `--registry-url` / `registryUrl`
2. `cdnBaseUrls` from config (replaces built-in defaults when set)
3. Built-in defaults (`unpkg` / `jsdelivr` / GitHub raw)

`--strict-cdn` + explicit URL → **only** that URL.

`--registry-version` rewrites `@latest` → `@0.1.0` in URL templates.

## Commands

### `init`

```bash
bunx ui8kit init
bunx ui8kit init --yes --framework none --dir src
bunx ui8kit init --yes --framework templ --dir internal --skip-core
bunx ui8kit init --registry-url https://my-cdn/r --strict-cdn
```

Creates `ui8kit.config.json` + canonical directories. Optionally pulls lib/utils/variants from registry.

### `add`

```bash
bunx ui8kit add button
bunx ui8kit add button card --force
bunx ui8kit add --all --runtime svelte
bunx ui8kit add button --dry-run
bunx ui8kit add button --registry-url https://my-cdn/r --registry-version 0.1.0
```

Install **preserves nested paths** (e.g. `components/ui/button/Button.svelte`), no basename flatten.

### `list` / `diff` / `info` / `cache` / `reset` / `scan` / `build`

Same roles as v1; `info --cdn` shows resolved CDN order.

## Registry item (contract)

```json
{
  "name": "button",
  "type": "registry:ui",
  "runtime": "svelte",
  "digest": "0.1.0",
  "dependencies": ["clsx", "tailwind-merge"],
  "registryDependencies": ["utils"],
  "files": [
    {
      "path": "ui/button/Button.svelte",
      "target": "components/ui/button/Button.svelte",
      "content": "..."
    },
    {
      "path": "ui/button/button.variants.json",
      "target": "components/ui/button/button.variants.json",
      "content": "..."
    }
  ]
}
```

## Breaking changes (v1 → v2)

- `framework: "vite-react"` → `react` | `svelte` | … | `none`
- `init` no longer requires Vite + React
- Install paths use `{dir}/…` + optional `paths` remap
- File install preserves relative structure (`target` / path), not basename-only
- New types: `registry:utils`, `registry:widget`
- Config fields: `dir`, `runtime`, `cdnBaseUrls`, `contractVersion`

## Registry publish loop

1. Author/kit digest published as registry JSON on a CDN base  
2. Apps: `ui8kit init` + `ui8kit add --runtime … --registry-version D`  
3. Maintainers: `ui8kit scan` → `ui8kit build` to assemble `packages/registry/r`  
4. Tailwind `content` / `@source` points at `{dir}/**`

## Development / publish

```bash
npm install
npm run type-check
npm test
npm run build
npm run pack:check   # dry-run tarball contents
# npm publish        # after npm login; runs prepublishOnly
```

Maintainer scripts (local fixtures, CDN probe): see [scripts/README.md](scripts/README.md).

User & author guides: see [docs/README.md](docs/README.md).

## License

MIT
