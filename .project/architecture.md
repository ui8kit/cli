# Architecture — shadcn-style delivery, multi-runtime primitives

## One-sentence product

**ui8kit** is a file-writing registry CLI (like shadcn): fetch JSON from CDN → write sources into the app under `{dir}/…`. It is **not** an npm component library SoT.

```text
codegen (SoT) → pack → registry digest (/r on CDN)
                              ↓
                    ui8kit add / init
                              ↓
                    app source tree (Tailwind sees classes)
```

## Two complexity walls (do not blur)

```text
┌─────────────────────────────────────────────────────────────┐
│  PRIMITIVES WALL (hard)                                     │
│  codegen · multi-runtime files · shared/variants · utils    │
│  types: registry:ui + registry:utils                        │
│  --runtime file filter lives HERE only                      │
└─────────────────────────────────────────────────────────────┘
                              ↓ published digest
┌─────────────────────────────────────────────────────────────┐
│  SHADCN-PLAIN WALL (simple — future blocks/widgets)         │
│  one item ≈ one runtime (or already filtered)               │
│  types: registry:component|composite|block|layout|widget    │
│  no file-extension heuristics; item.runtime skip only       │
└─────────────────────────────────────────────────────────────┘
```

**Overengineering risk:** applying multi-runtime file filters, path rewrites, and scan pipelines to blocks/widgets “for consistency”. Prefer publishing those items already single-stack.

## Canonical folders under `{dir}`

| Folder | Type | Notes |
|--------|------|-------|
| `lib/` | `registry:lib` | low-level helpers (optional; empty in current digest) |
| `utils/` | `registry:utils` | `cn`, `expr`, `variants`, `tags` — **required by bricks** |
| `components/ui/` | `registry:ui` | primitives (codegen bricks) |
| `components/` | component/composite | future |
| `blocks/` | block | future |
| `layouts/` | layout | future |
| `variants/` | variants | optional |
| `widgets/` | widget | future |

Config may set `paths` remap (e.g. `ui → kit`). **Bug:** remap currently ignored when `files[].target` is set — see known-issues.

## Config (`ui8kit.config.json`) highlights

- `contractVersion: "2.0.0"`
- `framework` / `runtime`: `react|svelte|vue|solid|templ|latte|twig` (+ `none` for framework)
- `dir`: install root (`src`, `web/src`, `internal`, …)
- `paths`: intended remap of canonical folders
- `registryUrl` / `registryVersion` / `cdnBaseUrls` / `strictCdn`
- `aliases` + `importStyle`: transform only rewrites **`@/…`** imports (codegen uses **relative** `../../utils` — aliases rarely help)

## CLI commands (roles)

| Command | Role |
|---------|------|
| `init` | Write config + empty dirs; optionally install core lib/utils/variants (**best-effort**, separate code path from `add`) |
| `add` | Install named items + `registryDependencies` tree; `--runtime` filters **files** for multi-file bricks; `--all` |
| `list` / `diff` / `info` / `cache` / `reset` | Inspect / compare / diagnostics |
| `scan` | Author: invent registry from local tree (poor fit for multi-runtime codegen layout) |
| `build` | Author: embed file contents into digest JSON under output dir (`r/`) |

## Install path resolution (critical)

`resolveFileInstallPath` (`src/utils/paths.ts`):

1. If `file.target` present → `join(dir, target)` — **does not apply `config.paths`**
2. Else strip prefixes and join `dir` + `typeFolder` (typeFolder **does** use `paths`)

Current registry **always** sets `target` (e.g. `components/ui/button/Button.svelte`, `utils/cn.ts`). Therefore consumer always gets:

```text
{dir}/components/ui/<brick>/…
{dir}/utils/…
```

MentorYChat / TestApp desire `src/kit/<brick>` requires post-move or a future prefix remap fix.

## Runtime file filter (2.0.1)

`src/utils/runtime-files.ts` + used in `add.ts`:

| Runtime | Kept (+ always shared) |
|---------|------------------------|
| react | `*.tsx` except `*.solid.tsx` |
| solid | `*.solid.tsx` |
| svelte | `*.svelte` |
| vue | `*.vue` |
| templ | `*.templ`, `*_templ.go`, `*_gen.go` |
| latte | `*.latte` |
| twig | `*.twig` / `*.html.twig` |

Shared always: `*.shared.ts`, `*.variants.json`.  
**Never sliced:** `registry:utils|lib|variants` (whole item).  
Also: if item has field `runtime` ≠ requested → skip whole item.

## Core / utils exclusion (bug root)

`add.ts`:

```ts
const ADD_EXCLUDED_COMPONENT_TYPES = ["registry:variants", "registry:lib", "registry:utils"]
// passed as excludeTypes into getComponent / getAllComponents
```

`getComponentByType` filters index entries by `excludeTypes` → **utils is invisible to add and to dependency resolution**.

`init` has a **separate** `installCoreFiles` that fetches `utils/utils.json` without that exclude — so init without `--skip-core` can install utils, but `add button` alone cannot pull utils as a dep.

## Transform layer

`applyTransforms` only rewrites `@/…` specifiers. Codegen bricks import `../../utils` / `../../utils/expr`. Remapping utils under `kit/utils` **breaks** those imports unless rewrite is added (anti-goal for now — prefer keep utils at `{dir}/utils`).

## Author / publish pipeline (registry repo)

```text
ui8kit-codegen/generated/{ui,utils}
        ↓ pack-from-codegen.mjs
ui8kit-registry/src/  (gitignored staged kit + registry.json)
        ↓ npx ui8kit@2.0.1 build … --output r
ui8kit-registry/r/   (published)
        ↓ npm publish @ui8kit/registry
CDN unpkg / jsdelivr
```

Pack resolution order: `--codegen` → sibling `../@ui8kit-codegen/generated` → `git clone` GitHub `ui8kit/codegen` into `.cache/codegen/`.
