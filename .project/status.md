# Status — ui8kit CLI + registry (2026-08-11)

## Published artifacts

| Package | Version | Role |
|---------|---------|------|
| [`ui8kit`](https://www.npmjs.com/package/ui8kit) | **2.0.1** | Consumer + author CLI (`init` / `add` / `list` / `diff` / `scan` / `build`) |
| [`@ui8kit/registry`](https://www.npmjs.com/package/@ui8kit/registry) | **2.0.0** | Published digest JSON under `/r` for CDN |

Contract version stamped in config: **`2.0.0`** (`contractVersion`). Patch **2.0.1** added runtime **file** filtering only.

## CDN (working today)

```text
https://unpkg.com/@ui8kit/registry@2.0.0/r/index.json
https://unpkg.com/@ui8kit/registry@2.0.0/r/components/ui/button.json
https://unpkg.com/@ui8kit/registry@2.0.0/r/utils/utils.json
https://cdn.jsdelivr.net/npm/@ui8kit/registry@2.0.0/r/...
```

CLI defaults (when no `registryUrl`):

```text
https://unpkg.com/@ui8kit/registry@latest/r
https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r
```

Local registry repo (source of `/r`): `e:\_@Bun\@ui8kit-registry\`  
Built tree: `r/components/ui/*.json` (33 bricks) + `r/utils/utils.json` + `r/index.json`.

## What works

- `npx ui8kit@2.0.1 init --yes --framework svelte --runtime svelte --dir src …`
- `ui8kit add --all --runtime svelte` against `@ui8kit/registry@2.0.0` → writes multi-file bricks filtered to `.svelte` + shared (`*.shared.ts`, `*.variants.json`)
- `ui8kit build` used by registry package to assemble `/r` from staged `src/registry.json`
- Registry pack: `scripts/pack-from-codegen.mjs` (sibling codegen **or** GitHub clone)
- Unit tests green for CLI including `tests/utils/runtime-files.test.ts`
- Smoke app `@TestApp`: Vite + Svelte 5 + Tailwind 4 + Bun; greeting UI from kit primitives; `bun run build` OK

## What does NOT work cleanly (see known-issues.md)

1. **`utils` cannot be installed via `add`** (excluded from fetch) — even as `registryDependencies`
2. **`config.paths` ignored** when registry files have `target:` (always true for current digest)
3. Relative `../../utils` imports assume utils at `{dir}/utils`, not under `kit/`
4. Manual workarounds required for MentorYChat-style `src/kit` layout

## Explicit pause

> **CLI refactor deferred.** Next work is brainstorm + patch series (likely 2.0.2 / 2.1.0), not drive-by fixes in this session. Until then: use CDN + documented workarounds in TestApp README.

## Engines / deps

- Node `>=20`, Bun fine for consumer apps
- Runtime deps: `commander`, `prompts`, `zod` only
- Repo: `https://github.com/ui8kit/cli`
