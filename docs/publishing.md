# Publishing a registry

How authors turn a kit source tree into a consumable CDN digest.

## Pipeline

```text
kit source (components/ui, blocks, …)
        │
        ▼
  ui8kit scan   →  src/registry.json   (manifest: paths + deps metadata)
        │
        ▼
  ui8kit build  →  packages/registry/r/**/*.json + index.json
        │
        ▼
  static host / npm package / GitHub raw / unpkg
        │
        ▼
  consumers: ui8kit init / add --registry-url …
```

## Prerequisites

- Kit layout roughly matches canonical folders under `src/` (or adjust scan defaults)
- Files that should ship are exportable modules (scan skips files without `export`)
- Node `>=20` for the CLI

## Step-by-step

### 1. Scan

From the kit repository root:

```bash
npx ui8kit scan --source src --output src/registry.json
```

Review `src/registry.json`:

- Correct `type` per item
- `dependencies` / `registryDependencies` look right
- Paths point at real files

### 2. Build

```bash
npx ui8kit build src/registry.json --output packages/registry/r
```

Verify:

```bash
ls packages/registry/r/index.json
ls packages/registry/r/components/ui/
```

Each item JSON must include embedded `files[].content`.

### 3. Serve locally (smoke)

```bash
# from packages/registry parent so /r is the URL path
cd packages/registry
python -m http.server 4173
```

Consumer test:

```bash
cd /path/to/app
npx ui8kit init --yes --framework none --dir src --skip-core \
  --registry-url http://127.0.0.1:4173/r --strict-cdn
npx ui8kit add button --registry-url http://127.0.0.1:4173/r --strict-cdn
```

Or use the maintainer smoke scripts (needs local `.workflow` fixtures): see [scripts/README.md](../scripts/README.md).

### 4. Publish

Any static host works. Examples:

**npm package** `@ui8kit/registry` with files under `r/`:

```text
https://unpkg.com/@ui8kit/registry@0.1.0/r/index.json
```

**Custom CDN**:

```text
https://cdn.example.com/ui8kit/0.1.0/r/index.json
```

Document the base URL (`…/r`) for consumers.

### 5. Clean rebuilds

```bash
npx ui8kit registry clean --force
npx ui8kit scan …
npx ui8kit build …
```

`--all` also removes `src/registry.json`.

## Multi-runtime releases

Options:

1. **One JSON per brick, all stacks inside** — consumers use `--runtime` for **file-level** filter (recommended for codegen digests)
2. **Separate packages / URL prefixes** per runtime (`…/svelte/r`, `…/react/r`)
3. **Tagged digests** via `registryVersion` / npm dist-tags
4. **Item-level `runtime`** field — consumer `--runtime` skips mismatched items on a shared index

Prefer immutable URLs for production apps (`@0.1.0`, content-hashed paths).

## What build does *not* do

- No Tailwind utility-map generation
- No JSON Schema codegen into `packages/registry/schema`
- No TypeScript program analysis beyond simple import/export text scans on `scan`

Keep kit-specific transforms in codegen; keep this CLI as delivery + assembly.
