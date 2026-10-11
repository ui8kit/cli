# Troubleshooting

## Command fails with CDN / network errors

**Symptoms:** `list` / `add` / `init` cannot fetch `index.json`.

**Checks:**

```bash
ui8kit info --cdn
curl -I "$REGISTRY_URL/index.json"
ui8kit --no-cache list --registry-url "$REGISTRY_URL" --strict-cdn
```

**Fixes:**

- Correct base URL (must include `/r`)
- Enable VPN for private hosts
- Clear cache: `ui8kit cache clear`
- Confirm digest exists for `--registry-version`

## `strict-cdn` install fails but without it succeeds

You are falling back to a public CDN. Fix the private URL or publish the digest there. Keep `--strict-cdn` in CI.

## Component not found

**Symptoms:** `add button` → not found.

**Checks:**

```bash
ui8kit list --json
```

- Name must match `components[].name` in `index.json` (usually lowercase)
- Whole item may be skipped if item `runtime` ≠ `--runtime`
- With a multi-file brick and `--runtime`, only that stack’s files are written — check you did not expect other extensions on disk
- Core types (`lib` / `utils` / `variants`) are hidden from default `list` but still installable via deps / init

## Files land in the wrong folder

- Check `dir` and `paths` in `ui8kit.config.json`
- Prefer `files[].target` in published items
- Remember v2 **preserves nesting** (no basename flatten)

## Tailwind missing classes

- Point `content` / `@source` at `{dir}/**`
- Ensure utilities are in **source files under `{dir}`**, not only in `node_modules`
- Rebuild CSS after `add`

## Import path broken after install

- Align bundler aliases with config `aliases`
- Try `importStyle: "alias"` (default) vs `"package"`
- Re-add with `--force` after changing aliases

## `init` overwrites config

`init` prompts before overwrite unless scripted carefully. Keep config in git. Use `--yes` only when intentional.

## `reset` deleted too much

`reset` removes kit state by design. Prefer `reset --dry-run` first. Recover from git.

## `scan` misses files

- File needs an `export` statement
- `index` and `_`-prefixed files are skipped in directory scans
- Confirm `--source` / cwd

## `build` file not found

Manifest `files[].path` must exist relative to build cwd. Re-run `scan` after moving sources.

## Vitest / CI: `styleText` export error

Node 18 is unsupported. Use Node `>=20` (CI matrix 20/22/24). See package `engines`.

## Shareable diagnostics

```bash
ui8kit info --json
ui8kit info --cdn
node -v
```

Attach these when filing issues.

## "Unresolved import" after `add --runtime …`

Since 2.0.2 the runtime filter keeps `*.types.ts` / `*.d.ts` and every file imported by a kept file. If an import is still unresolved it points at **another registry item** — check that item is listed in `registryDependencies`. On 2.0.0/2.0.1 the workaround was `init --framework none`; it is no longer needed.

## "Circular registry dependency" / "Unresolved dependency cycle"

Removed in 2.0.2: cycles (usually type-only imports) are installed once without a warning; run with `--verbose` to list type-only edges. A single `Runtime import cycle between …` warning means every edge in the cycle is a value import — check those files for circular runtime imports.
