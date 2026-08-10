# Concepts

## What this CLI is

`ui8kit` is a **registry delivery tool**:

1. Resolve a registry base URL (CDN / private host)
2. Fetch `index.json` and item JSON artifacts
3. Write item `files[].content` into the consumer app under `{dir}/…`
4. Optionally install npm dependencies declared on the item
5. Optionally **scan** a local kit and **build** publishable registry artifacts

It is **not**:

- A component runtime or design system implementation
- An AST-heavy codegen for Tailwind utility maps
- A package that expects you to import primitives from `node_modules` as the source of truth

Codegen (e.g. `ui8kit-codegen`) can **produce** digests; this CLI **distributes** them.

## Contract version

`contractVersion: "2.0.0"` describes the config + folder + item shape this CLI understands.

Keep consumer configs and published registries aligned on the same major contract.

## Framework vs runtime

| Field | Role |
|-------|------|
| `framework` | Project stack hint: `react` \| `svelte` \| `vue` \| `solid` \| `templ` \| `latte` \| `twig` \| `none` |
| `runtime` | Registry slice to install when digests publish multiple stacks (often equals framework for JS) |

Examples:

- Svelte app → `framework: "svelte"`, `runtime: "svelte"`
- Go Templ site with kit on disk → `framework: "templ"`, `runtime: "templ"`
- Unknown / multi-kit host → `framework: "none"`

## Canonical folders

All installs are rooted at `config.dir` (default `src`). Logical folders:

| Folder under `{dir}` | Registry type(s) | Typical content |
|----------------------|------------------|-----------------|
| `lib/` | `registry:lib` | Low-level helpers |
| `utils/` | `registry:utils` | Shared helpers (`cn`, …) |
| `components/` | `registry:component`, `registry:composite` | Composites |
| `components/ui/` | `registry:ui` | Primitives / atoms |
| `blocks/` | `registry:block` | Page sections |
| `layouts/` | `registry:layout` | Shells / chrome |
| `variants/` | `registry:variants` | Variant maps / tokens |
| `widgets/` | `registry:widget` | UI + light behavior |

### Path remap

Logical names stay stable; physical folders can move via `paths`:

```json
{
  "dir": "web/src",
  "paths": {
    "ui": "kit",
    "utils": "kit/utils",
    "blocks": "sections"
  }
}
```

Install of `registry:ui` then lands under `web/src/kit/…` instead of `web/src/components/ui/…`.

## Install path rules

For each file in a registry item:

1. Prefer `files[].target` when set (relative to `{dir}`)
2. Else derive from `files[].path` + item `type`, **preserving nested structure**
3. **Never** flatten to basename-only (v1 behavior removed)

Example install:

```text
target: components/ui/button/Button.svelte
→ {dir}/components/ui/button/Button.svelte
```

## Registry dependencies

Items may declare:

| Field | Meaning |
|-------|---------|
| `dependencies` | npm packages to install into the consumer |
| `devDependencies` | npm dev packages |
| `registryDependencies` | Other registry item **names** to fetch first |

`add` resolves the registry dependency tree before writing files.

## Import rewriting

When installing TS/JS sources, the CLI may rewrite `@/…` import specifiers:

| `importStyle` | Behavior |
|---------------|----------|
| `alias` (default) | Remap using `config.aliases` |
| `package` | Map component-group aliases to `@ui8kit/core` barrel |

Non-JS assets (`.svelte`, `.vue`, `.templ`, JSON, CSS) are still written; rewrite applies to transformable extensions.

## Author vs consumer roles

| Role | Primary commands |
|------|------------------|
| **Consumer** | `init`, `add`, `list`, `diff`, `info`, `cache`, `reset` |
| **Author / maintainer** | `scan`, `build`, `registry clean` |

Same binary; different workflows. See [Publishing](./publishing.md) and [Maintain registry](./scenarios/maintain-registry.md).
