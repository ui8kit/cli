# Commands

Global options (all commands):

```bash
ui8kit [options] <command>

  -c, --cwd <dir>     Working directory
  -v, --verbose       Verbose logs
  --no-cache          Bypass registry cache
  -V, --version       Print version
  -h, --help          Help
```

---

## `init`

Initialize `ui8kit.config.json` and canonical folders. Optionally fetch core registry items.

```bash
ui8kit init [options]
```

| Option | Description |
|--------|-------------|
| `-y, --yes` | Non-interactive defaults |
| `-r, --registry <type>` | Registry type (default `ui`) |
| `--framework <name>` | `react\|svelte\|vue\|solid\|templ\|latte\|twig\|jinja2\|none` |
| `--runtime <name>` | Default runtime slice |
| `--dir <path>` | Install root |
| `--skip-core` | Do not fetch lib/utils/variants on init |
| `--registry-url <url>` | Registry base override |
| `--registry-version <version>` | Registry version/range/dist-tag (default: CLI major) |
| `--strict-cdn` | No CDN fallback when URL set |
| `--import-style <alias\|package>` | Import rewrite style |

### Examples

```bash
ui8kit init
ui8kit init --yes --framework svelte --dir web/src
ui8kit init --yes --framework templ --dir internal --skip-core
ui8kit init --yes --registry-url https://cdn.example.com/r --strict-cdn
```

---

## `add`

Install one or more components (and their `registryDependencies`) into app folders.

```bash
ui8kit add [components...] [options]
```

| Option | Description |
|--------|-------------|
| `-a, --all` | Install all listable components |
| `-f, --force` | Overwrite existing files |
| `-r, --registry <type>` | Registry type (default `ui`) |
| `--runtime <name>` | Install only this runtime’s files (+ shared); skip items with a mismatched `runtime` field |
| `--path <key=dir>` | Override an install folder for this run (repeatable), e.g. `--path ui=kit`. Beats `config.paths` and registry `target`s. Keys: `lib`, `utils`, `components`, `ui`, `blocks`, `layouts`, `variants`, `widgets` |
| `--dry-run` | Plan only; no writes |
| `--retry` | Retry failed CDN requests |
| `--registry-url <url>` | Registry base override |
| `--registry-version <version>` | Version pin |
| `--strict-cdn` | No fallback |

### Examples

```bash
ui8kit add button
ui8kit add button card --force
ui8kit add --all --runtime svelte
ui8kit add button --dry-run
ui8kit add button --registry-url https://cdn.example.com/r --registry-version 0.1.0 --strict-cdn
```

Interactive mode (no names, no `--all`) prompts for selection when a TTY is available.

### Runtime file filter

Registry bricks often ship **all** stacks in one item (no per-item `runtime`). With `--runtime` / `config.runtime`, `add` keeps:

| Runtime | Files kept (plus shared) |
|---------|--------------------------|
| `react` | `*.tsx` except `*.solid.tsx` |
| `solid` | `*.solid.tsx` |
| `svelte` | `*.svelte` |
| `vue` | `*.vue` |
| `templ` | `*.templ`, `*_templ.go`, `*_gen.go` |
| `latte` | `*.latte` |
| `twig` | `*.twig` / `*.html.twig` |
| `jinja2` | `*.j2` / `*.html.j2` / `*.jinja` / `*.jinja2` |

**Single-runtime items are never sliced** (since 2.0.3): when the item itself declares `runtime` and it equals the requested runtime (per-runtime registries such as `https://registry.buildy.tw/solid`), every file of the item is written, whatever its extension (`*.tsx` for Solid, `lucide_icons.go` for templ, `lucide-icons.json` for Twig/Latte/Jinja2, …). The table above applies to multi-stack items (no item-level `runtime`).

Also always kept:

- **Type files**: `*.types.ts`, `*.types.tsx`, `*.d.ts` (they are not tied to a runtime and blocks import them).
- **Imported files**: every file of the same item that a kept file imports with a relative specifier (`./x`, `../x`; extensions and `index` files are resolved; followed transitively). A file that another selected file imports is never dropped, even if it belongs to another runtime.

Shared always: `*.shared.ts`, `*.variants.json`. Types `registry:utils`, `registry:lib`, `registry:variants` are never sliced. If an item sets `runtime: "svelte"` and you pass `--runtime react`, the whole item is skipped.

### Dependency resolution

`add` resolves `registryDependencies` recursively and installs every item once (dependencies first).

- **`utils` and `lib/*`**: `utils`, `utils/<name>`, `lib/<name>` (and bare lib names present in `index.json`) are fetched from their own type endpoints (`utils/<name>.json`, `lib/<name>.json`). They are hidden from the interactive picker and from `--all` listings, but are installed whenever an item depends on them. When they are only pulled in as dependencies, existing files are **never overwritten** (not even with `--force`); `ui8kit add utils --force` overwrites explicitly. `init` still installs core `utils`/`lib`/`variants` unless `--skip-core`.
- **Cycles**: items may depend on each other (typically type-only imports such as `feature-grid` ↔ `feature-cards`). Cycles are not an error: no default warning, each item is installed once. With `--verbose` the type-only edges of a cycle are listed. A cycle where every edge is a value import gets a single one-line warning.
- **Missing items** still warn `Component <name> not found in <registry> registry, skipping`.

---

## `list`

List components advertised by the registry index.

```bash
ui8kit list [options]
```

| Option | Description |
|--------|-------------|
| `-r, --registry <type>` | Registry type |
| `--json` | Machine-readable JSON |
| `--registry-url <url>` | Override |
| `--registry-version <version>` | Pin |
| `--strict-cdn` | No fallback |

```bash
ui8kit list
ui8kit list --json --registry-url https://127.0.0.1:4173/r --strict-cdn
```

Certain types (`registry:lib`, `registry:utils`, `registry:variants`) are excluded from the default list (installed via `init` core / dependencies).

---

## `diff`

Compare local installed files with registry versions.

```bash
ui8kit diff [component] [options]
```

| Option | Description |
|--------|-------------|
| `-r, --registry <type>` | Registry type |
| `--json` | JSON report |
| `--registry-url <url>` | Override |
| `--registry-version <version>` | Pin |
| `--strict-cdn` | No fallback |

```bash
ui8kit diff
ui8kit diff button
ui8kit diff button --json
```

Remote content is normalized with the same import transforms used on install before compare.

---

## `info`

Environment and config diagnostics.

```bash
ui8kit info [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Full JSON payload |
| `--cdn` | Print resolved CDN order and overrides |

```bash
ui8kit info
ui8kit info --cdn
ui8kit info --json
```

---

## `cache clear`

Delete the on-disk registry cache (`~/.ui8kit/cache`).

```bash
ui8kit cache clear
```

---

## `reset`

Remove local UI8Kit state (config, kit folders, generated registry artifacts). Destructive.

```bash
ui8kit reset [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Show targets only |
| `--with-cache` | Also clear `~/.ui8kit/cache` |
| `-y, --yes` | Skip prompts |
| `-f, --force` | Skip confirmation |

```bash
ui8kit reset --dry-run
ui8kit reset --yes --with-cache
```

---

## `scan` (authors)

Walk local source folders and emit `registry.json` (manifest without file bodies).

```bash
ui8kit scan [options]
```

| Option | Description |
|--------|-------------|
| `-r, --registry <type\|path>` | Registry label (default `ui`) |
| `-o, --output <file>` | Output path (default `./src/registry.json`) |
| `-s, --source <dir>` | Source root hint (default `./src`) |

```bash
ui8kit scan --source src --output src/registry.json
```

Scan detects exports and import-based npm / registry dependencies via lightweight text analysis (no TypeScript AST).

---

## `build` (authors)

Read `registry.json`, embed file contents, write per-item JSON + `index.json` under the output tree.

```bash
ui8kit build [registry.json] [options]
```

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output dir (default `./packages/registry/r`) |

```bash
ui8kit build src/registry.json --output packages/registry/r
```

Output layout (by type):

```text
packages/registry/r/
  index.json
  components/ui/<name>.json
  components/<name>.json
  blocks/<name>.json
  layouts/<name>.json
  lib/<name>.json
  utils/<name>.json
  components/variants/<name>.json
  widgets/<name>.json
```

Does **not** emit JSON Schema files or utility class maps.

---

## `registry clean` (authors)

Remove generated registry artifacts.

```bash
ui8kit registry clean [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | List paths |
| `--all` | Also remove `src/registry.json` |
| `-f, --force` | Skip confirmation |

Targets include `packages/registry/r`, leftover `schema/`, and legacy `ui8kit.map.json` if present.

```bash
ui8kit registry clean --dry-run
ui8kit registry clean --force --all
```
