# Registry format

Public contract for artifacts served under a registry base URL ending in `/r`.

## Index: `GET {base}/index.json`

```json
{
  "$schema": "https://ui.buildy.tw/schema/registry.json",
  "components": [
    {
      "name": "button",
      "type": "registry:ui",
      "title": "Button",
      "description": "Primary button",
      "dependencies": ["clsx"],
      "registryDependencies": ["utils"]
    }
  ],
  "categories": ["lib", "utils", "ui", "components", "blocks", "layouts", "variants", "widgets"],
  "version": "1.0.0",
  "lastUpdated": "2026-08-11T00:00:00.000Z",
  "registry": "ui"
}
```

Consumers use this list for `list`, `add --all`, and dependency planning.

## Item: `GET {base}/{folder}/{name}.json`

Folder mapping used by `build` / fetchers:

| `type` | Folder under `/r` |
|--------|-------------------|
| `registry:ui` | `components/ui` |
| `registry:component` / `composite` | `components` |
| `registry:block` | `blocks` |
| `registry:layout` | `layouts` |
| `registry:lib` | `lib` |
| `registry:utils` | `utils` |
| `registry:variants` | `components/variants` |
| `registry:widget` | `widgets` |

Example item:

```json
{
  "$schema": "https://ui.buildy.tw/schema/registry-item.json",
  "name": "button",
  "type": "registry:ui",
  "title": "Button",
  "description": "Primary button primitive",
  "runtime": "svelte",
  "digest": "0.1.0",
  "dependencies": ["clsx", "tailwind-merge"],
  "devDependencies": [],
  "registryDependencies": ["utils"],
  "files": [
    {
      "path": "ui/button/Button.svelte",
      "target": "components/ui/button/Button.svelte",
      "content": "<script lang=\"ts\">…</script>\n"
    },
    {
      "path": "ui/button/button.variants.json",
      "target": "components/ui/button/button.variants.json",
      "content": "{ \"variants\": { … } }\n"
    }
  ],
  "meta": {
    "tags": ["form", "primitive"]
  }
}
```

### Item fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Stable id (list / add argument) |
| `type` | yes | One of the `registry:*` types |
| `files` | yes | At least one file with `path` + `content` when published |
| `target` (per file) | recommended | Install path relative to consumer `dir` |
| `runtime` | recommended for multi-stack digests | Filter with `--runtime` |
| `digest` | optional | Digest / release id |
| `dependencies` | optional | npm deps |
| `devDependencies` | optional | npm devDeps |
| `registryDependencies` | optional | Other item names |
| `title` / `description` | optional | Docs / list UI |
| `tailwind` / `cssVars` | optional | Metadata for consumers/tooling |
| `meta` | optional | Free-form |

### Authoring manifest (`src/registry.json`)

Produced by `scan`. Files usually omit `content` until `build` embeds them:

```json
{
  "$schema": "https://ui.buildy.tw/schema/registry.json",
  "items": [
    {
      "name": "button",
      "type": "registry:ui",
      "dependencies": [],
      "devDependencies": [],
      "registryDependencies": [],
      "files": [
        { "path": "src/components/ui/button.tsx" }
      ]
    }
  ],
  "version": "1.0.0",
  "lastUpdated": "2026-08-11T00:00:00.000Z",
  "registry": "ui"
}
```

Paths in the manifest are relative to the **author package cwd** (kit repo), not the consumer `dir`.

## Multi-runtime digests

Publish separate items (or separate registries) per runtime:

```text
/r/components/ui/button.json          # runtime: "react"
# or versioned bases:
https://cdn.example.com/ui8kit@0.1.0-svelte/r/...
https://cdn.example.com/ui8kit@0.1.0-react/r/...
```

Consumers select with `--runtime` and/or `--registry-version`.

## Validation

- Consumer fetches validate item shape with Zod (`componentSchema`)
- `build` validates with `registrySchema` / `registryItemSchema`

Invalid CDN payloads fail the install with a clear error rather than writing partial junk.
