# Configuration

Project file: **`ui8kit.config.json`** in the working directory (created by `init`).

Validated with Zod at read time. Legacy `framework: "vite-react"` is soft-migrated to `"react"`.

## Full example

```json
{
  "$schema": "https://ui.buildy.tw/schema.json",
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
| `framework` | enum | `"none"` | `react` \| `svelte` \| `vue` \| `solid` \| `templ` \| `latte` \| `twig` \| `none` |
| `runtime` | enum | — | Default digest slice for installs |
| `typescript` | boolean | `true` | Project uses TypeScript (metadata) |
| `globalCss` | string | `"src/index.css"` | Global / Tailwind entry path |
| `dir` | string | `"src"` | Install root for canonical folders |
| `paths` | object | — | Remap logical keys → folders under `dir` |
| `aliases` | record | see defaults | Import alias map for rewrite |
| `registry` | string | `"@ui8kit"` | Registry name label |
| `registryUrl` | url | — | Preferred registry base (`…/r`) |
| `registryVersion` | string | — | Pin: rewrites `@latest` → `@version` in URL templates |
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

## Default aliases (when `dir` is `src`)

```json
{
  "@": "./src",
  "@/lib": "./src/lib",
  "@/utils": "./src/utils",
  "@/components": "./src/components",
  "@/ui": "./src/components/ui",
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
  "dir": "internal",
  "typescript": false,
  "strictCdn": true,
  "registryUrl": "https://cdn.example.com/ui8kit/r"
}
```

See also [CDN and cache](./cdn-and-cache.md).
