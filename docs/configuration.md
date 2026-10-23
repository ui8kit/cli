# Configuration

Project file: **`ui8kit.config.json`** in the working directory (created by `init`).

Validated with Zod at read time. Legacy `framework: "vite-react"` is soft-migrated to `"react"`.

## Full example

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@ui8kit/registry@3/schema/schema.json",
  "contractVersion": "2.0.0",
  "framework": "svelte",
  "runtime": "svelte",
  "typescript": true,
  "globalCss": "web/src/app.css",
  "dir": "web/src",
  "paths": {
    "ui": "kit",
    "utils": "kit/utils"
  },
  "aliases": {
    "@": "./web/src",
    "@/lib": "./web/src/lib",
    "@/utils": "./web/src/kit/utils",
    "@/components": "./web/src/components",
    "@/ui": "./web/src/kit",
    "@/blocks": "./web/src/blocks",
    "@/layouts": "./web/src/layouts",
    "@/variants": "./web/src/variants",
    "@/widgets": "./web/src/widgets"
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

## Field reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `contractVersion` | string | `"2.0.0"` | Config/registry contract major |
| `framework` | enum | `"none"` | `react` \| `vue` \| `svelte` \| `solid` \| `webcomponent` \| `templ` \| `latte` \| `twig` \| `jinja2` \| `none` |
| `runtime` | enum | — | Default digest slice for installs |
| `typescript` | boolean | `true` | Project uses TypeScript (metadata) |
| `globalCss` | string | `"src/index.css"` | Global / Tailwind entry path |
| `dir` | string | `"src"` | Install root for canonical folders |
| `paths` | object | — | Remap logical keys → folders under `dir` |
| `aliases` | record | see defaults | Import alias map for rewrite |
| `registry` | string | `"@ui8kit"` | Registry name label |
| `registryUrl` | url | — | Preferred registry base (`…/r`) |
| `registryVersion` | string | CLI major (e.g. `3`) | Registry version/range/dist-tag for `@latest` placeholders: `3.0.0` (pin), `3`, `canary` |
| `cdnBaseUrls` | string[] | built-ins | Full ordered CDN bases (replaces defaults when set) |
| `strictCdn` | boolean | `false` | With `registryUrl` / `--registry-url`, do not fall back |
| `importStyle` | `"alias"` \| `"package"` | `"alias"` | How `@/…` imports are rewritten on install |

### Optional legacy fields

| Field | Notes |
|-------|-------|
| `componentsDir` | Older path hint; prefer `dir` + `paths` |
| `libDir` | Older path hint; prefer `dir` + `paths` |

## `paths` keys

All optional; values are relative to `dir` (no leading `./` required):

`lib` · `utils` · `components` · `ui` · `blocks` · `layouts` · `variants` · `widgets`

### `paths` precedence with registry `target`

Registry files usually carry a `target` (e.g. `ui/button/button.svelte` in 3.x, `components/ui/button/Button.svelte` in legacy items, or registry-specific such as `primitives/button/button.svelte`). Where a file lands is decided in this order:

1. **Explicit CLI flag**: `add --path ui=kit` (repeatable; keys as above).
2. **`config.paths`, mapped by target prefix**:
   - if the target starts with a canonical folder — `components/ui` → `ui`, `components` → `components`, `blocks`, `layouts`, `variants`, `widgets`, `utils`, `lib` (longest match first) — that prefix is replaced by the configured folder;
   - otherwise the target's first folder (e.g. `primitives/`, `presets/`) is treated as the item type's own folder and replaced by `paths[<key of the item type>]` (`registry:ui` → `ui`, `registry:lib` → `lib`, …).
3. **The file's `target`** (unchanged), when no `paths` entry applies.

Everything is relative to `dir`; keys you did not configure are not remapped. Without `paths` and without `--path` behaviour is exactly as in 2.0.0/2.0.1. Files without `target` keep using `paths` as before.

Example — `{ "paths": { "ui": "kit" } }`: `ui/button/button.svelte` / `components/ui/button/Button.svelte` → `src/kit/button/…`; `primitives/button/button.svelte` → `src/kit/button/button.svelte`; `blocks/hero.svelte` stays in `src/blocks/`.

Caveat: the CLI does not rewrite relative imports. Remap to folders at the same depth, and keep `utils` next to the remapped folders (bricks import `../../utils`, `../presets/defaults`, `../primitives/…`).

## Default aliases (when `dir` is `src`)

```json
{
  "@": "./src",
  "@/lib": "./src/lib",
  "@/utils": "./src/utils",
  "@/components": "./src/components",
  "@/ui": "./src/ui",
  "@/blocks": "./src/blocks",
  "@/layouts": "./src/layouts",
  "@/variants": "./src/variants",
  "@/widgets": "./src/widgets"
}
```

`init` regenerates aliases when `--dir` changes.

## CLI overrides vs config

Flags on `init` / `add` / `list` / `diff` override config for that invocation:

| Flag | Overrides |
|------|-----------|
| `--registry-url` | `registryUrl` |
| `--registry-version` | `registryVersion` |
| `--strict-cdn` | `strictCdn` |
| `--runtime` | Prefer that runtime: file-level filter (+ skip mismatched item `runtime`) |
| `--path key=dir` | (`add`) Override one `paths` key for this run; repeatable |
| `--import-style` | `importStyle` (init) |

Use flags for one-off CI pins; put stable values in config for daily work.

## Minimal configs

**JS SPA**

```json
{
  "contractVersion": "2.0.0",
  "framework": "react",
  "runtime": "react",
  "dir": "src"
}
```

**Go Templ**

```json
{
  "contractVersion": "2.0.0",
  "framework": "templ",
  "runtime": "templ",
  "registryVersion": "2.0.0",
  "dir": "internal",
  "typescript": false,
  "strictCdn": true,
  "registryUrl": "https://cdn.example.com/ui8kit/r"
}
```

See also [CDN and cache](./cdn-and-cache.md).
