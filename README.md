# ui8kit CLI v2

Universal **shadcn-style** registry service: `init` / `add` / `list` / `diff` / `scan` / `build` — fetch registry items and **write files into your app** (not into `node_modules`). Tailwind sees classes. Works for React, Svelte, Vue, Solid, Go Templ, Latte, Twig, Jinja2 — via `framework` / `runtime` + path contracts.

Contract version: **2.0.0** · npm package: **`ui8kit@3.0.0`** · digest: **`@ui8kit/registry@3.0.0`** (per-runtime `r/<runtime>/`; `--registry-version 3.0.0` resolves it, legacy `@2.0.0` root `r/` still works)

**Full documentation (English):** [docs/README.md](./docs/README.md)  
**Agents / maintainers:** [AGENTS.md](./AGENTS.md) · project hub: [.project/README.md](./.project/README.md)

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

## New app — utils + UI (recommended)

Published digest: `@ui8kit/registry@2.0.0` (`/r` on unpkg / jsDelivr).

> Since 2.0.2 `registry:utils` / `registry:lib` are also resolved through `registryDependencies` (`ui8kit add utils` works). Installing utils through **`init` (without `--skip-core`)** is still the simplest path.

### 1. Init (installs utils from CDN)

```bash
# Svelte example — omit --skip-core so core utils land under src/utils
bunx ui8kit@3.0.0 init --yes \
  --framework svelte \
  --runtime svelte \
  --dir src \
  --registry-url https://unpkg.com/@ui8kit/registry@2.0.0/r \
  --strict-cdn
```

Confirm: `src/utils/cn.ts` (and friends) exist. If the folder is empty, re-run init without `--skip-core` or fetch utils manually (see below).

### 2. Fill `ui8kit.config.json`

After init, edit to pin CDN + runtime (example for Vite/Svelte under `src/`):

```json
{
  "contractVersion": "2.0.0",
  "framework": "svelte",
  "runtime": "svelte",
  "typescript": true,
  "globalCss": "src/app.css",
  "dir": "src",
  "aliases": {
    "@": "./src",
    "@/ui": "./src/components/ui",
    "@/utils": "./src/utils"
  },
  "registry": "@ui8kit",
  "registryUrl": "https://unpkg.com/@ui8kit/registry@2.0.0/r",
  "registryVersion": "2.0.0",
  "strictCdn": true,
  "importStyle": "alias"
}
```

**Path remap note:** bricks import `../../utils` (relative). Keep utils at `{dir}/utils`, and remap folders at the same depth (e.g. `"paths": { "ui": "kit" }`). Since 2.0.2 `paths` **is honoured when a registry file sets `target`**: `--path key=dir` flag > `config.paths` (mapped by target prefix) > the file's `target` — see [Configuration → paths precedence](./docs/configuration.md#paths-precedence-with-registry-target). Do **not** set `"utils": "kit/utils"` without rewriting imports.

### 3. Add UI (runtime file filter)

```bash
bunx ui8kit@3.0.0 add button stack title text --runtime svelte --force
# or everything:
bunx ui8kit@3.0.0 add --all --runtime svelte --force
```

`--runtime svelte` keeps `.svelte`, `*.shared.ts`, `*.variants.json`, **type files** (`*.types.ts`, `*.d.ts`) and **any file a kept file imports** (relative imports, followed transitively), so installs never end up with unresolved imports.

Also install npm peers used by utils if missing:

```bash
bun add clsx tailwind-merge
# or: npm install clsx tailwind-merge
```

### Manual utils fallback (if init skipped core)

```bash
# Download item JSON and write files[] into {dir} by each file.target
curl -sL https://unpkg.com/@ui8kit/registry@2.0.0/r/utils/utils.json
# → write each files[].content to src/{files[].target}
```

Or with Node one-liner from app root (after `init` created `src/`):

```bash
node --input-type=module -e "
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const item = await fetch('https://unpkg.com/@ui8kit/registry@2.0.0/r/utils/utils.json').then(r => r.json());
for (const f of item.files) {
  const target = path.join('src', f.target);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, f.content);
  console.log('wrote', target);
}
"
```

## Quick start (short)

```bash
bunx ui8kit@3.0.0 init --yes --framework svelte --runtime svelte --dir src \
  --registry-url https://unpkg.com/@ui8kit/registry@2.0.0/r --strict-cdn
bunx ui8kit@3.0.0 add button --runtime svelte --force
```

Go / PHP (kit on disk). Prefer **with** core utils unless you only need markup:

```bash
bunx ui8kit@3.0.0 init --yes --framework templ --runtime templ --dir internal \
  --registry-url https://unpkg.com/@ui8kit/registry@2.0.0/r --strict-cdn
bunx ui8kit@3.0.0 add button --runtime templ --force
```

## Canonical folders under `{dir}`

| Path | Role | Registry type |
|------|------|----------------|
| `lib/` | low-level runtime helpers | `registry:lib` |
| `utils/` | shared helpers (`cn`, …) — **required by primitives** | `registry:utils` |
| `components/` | composites | `registry:component` / `composite` |
| `components/ui/` | **primitives** (codegen digest) | `registry:ui` |
| `blocks/` | page sections | `registry:block` |
| `layouts/` | chrome / shells | `registry:layout` |
| `variants/` | variant maps | `registry:variants` |
| `widgets/` | UI + behavior | `registry:widget` |

Safe remap intent (utils stay top-level under `dir`):

```json
{
  "dir": "src",
  "paths": { "ui": "kit" }
}
```

Avoid `"utils": "kit/utils"` until the CLI rewrites relative imports (not in 2.0.1).

## Config (`ui8kit.config.json`)

See the filled example in [New app — utils + UI](#new-app--utils--ui-recommended). Private CDN:

```json
{
  "contractVersion": "2.0.0",
  "framework": "react",
  "runtime": "react",
  "dir": "src",
  "globalCss": "src/app.css",
  "registryUrl": "https://cdn.example.com/ui8kit/r",
  "registryVersion": "2.0.0",
  "strictCdn": true
}
```

### CDN resolution order

1. `--registry-url` / `registryUrl`
2. `cdnBaseUrls` from config (replaces built-in defaults when set)
3. Built-in defaults (`unpkg` / `jsdelivr` for `@ui8kit/registry@latest/r`)

`--strict-cdn` + explicit URL → **only** that URL.

`--registry-version` rewrites `@latest` → `@2.0.0` in URL templates when applicable.

## Commands

### `init`

```bash
bunx ui8kit init
bunx ui8kit init --yes --framework none --dir src
bunx ui8kit init --yes --framework templ --dir internal
bunx ui8kit init --registry-url https://unpkg.com/@ui8kit/registry@2.0.0/r --strict-cdn
```

Creates `ui8kit.config.json` + canonical directories. **Without `--skip-core`**, pulls lib/utils/variants from the registry when present (this is how you get **utils** today).

### `add`

```bash
bunx ui8kit add button
bunx ui8kit add button card --force
bunx ui8kit add --all --runtime svelte
bunx ui8kit add button --dry-run
bunx ui8kit add button --registry-url https://unpkg.com/@ui8kit/registry@2.0.0/r --strict-cdn
```

Install **preserves nested paths** (e.g. `components/ui/button/Button.svelte`), no basename flatten.

**Runtime filter:** when `--runtime` or `config.runtime` is set, only that stack’s files are written, plus shared brick assets (`*.shared.ts`, `*.variants.json`), type files (`*.types.ts`, `*.d.ts`) and every file of the same item that a kept file imports (transitively). A file imported by a selected file is never dropped. Utils/lib items are installed in full. Items that declare a different item-level `runtime` field are skipped entirely.

**`utils` and `lib/*` dependencies:** `registryDependencies` entries `utils`, `lib/<name>` (or a bare lib item name listed in `index.json`) are resolved against their own endpoints (`utils/utils.json`, `lib/<name>.json`) and installed by `add` if missing — no more "not found in ui registry, skipping". Files that already exist are left untouched, even with `--force`, when the item was only pulled in as a dependency.

**Dependency cycles** (e.g. `feature-grid` ↔ `feature-cards` through type-only imports) are resolved quietly: each item is installed once. `--verbose` lists type-only edges.

```bash
# Multi-file brick on CDN → only Svelte + shared land on disk
bunx ui8kit add button --runtime svelte
```

Since 2.0.2 `ui8kit add utils` works (explicit item; `--force` overwrites). The [manual fallback](#manual-utils-fallback-if-init-skipped-core) is only needed for older CLIs.

### `list` / `diff` / `info` / `cache` / `reset` / `scan` / `build`

Same roles as v1; `info --cdn` shows resolved CDN order.

## Registry item (contract)

```json
{
  "name": "button",
  "type": "registry:ui",
  "digest": "2.0.0",
  "dependencies": [],
  "registryDependencies": ["utils", "slot"],
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

1. Author/kit digest published as registry JSON on a CDN base (`@ui8kit/registry`)
2. Apps: `ui8kit init` (with core) + `ui8kit add --runtime …`
3. Maintainers: pack codegen → `ui8kit build` → publish `r/`
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
Deferred CLI fixes / known issues: [.project/known-issues.md](./.project/known-issues.md).

## License

MIT
