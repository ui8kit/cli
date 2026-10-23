# AGENTS.md — ui8kit CLI 3.x

npm package **`ui8kit`** (bin `ui8kit`): installs registry JSON from `@ui8kit/registry@<CLI major>/r/<runtime>/` into app source trees.

## Stack

TypeScript ESM, Node `>=20`; runtime deps `commander`, `prompts`, `zod` only; build `tsup` → `dist/`; tests Vitest.

## Before you call a change done

```bash
npm run type-check && npm test && npm run build && npm run pack:check
```

Update `CHANGELOG.md`, README / `docs/` when behavior changes. CI runs Linux (Node 20/22/24) and Windows (Node 22).

## Map

| Path | What |
|------|------|
| `src/commands/` | `init`, `add`, `list`, `diff`, `info`, `scan`, `build`, … |
| `src/registry/` | fetch, CDN resolution, cache scope, schemas |
| `src/utils/schema-config.ts` | defaults: CDN bases, schema URLs, folders |
| `src/utils/paths.ts` | install paths (`target` vs `paths`) |
| `src/utils/runtime-files.ts` | `--runtime` file filter (primitives) |
| `docs/` | user docs (shipped in the npm tarball) |
| `scripts/` | maintainer scripts (not shipped) |

## Facts to keep straight

- Registry `>= 3` is per-runtime: `r/{react,vue,svelte,solid,webcomponent}/`. Default version = CLI major (`@3`), not `@latest`.
- Bricks install to `{dir}/ui/<brick>/`; utils to `{dir}/utils` (bricks import `../../utils`).
- `registry:rules` is installed by `init` only, to `.cursor/rules/ui8kit-primitives.mdc` (`{kit}`, `{globs}` substituted).
- templ/latte/twig/jinja2 are legacy: frozen 2.0.0 digest (`--registry-version 2.0.0`).
- `--import-style package` is deprecated (warns).

## Rules

1. Read the code before changing it; do not invent flags or APIs.
2. The `--runtime` multi-file filter is for `registry:ui` primitives; publish other item types single-stack.
3. No heavy deps (chalk, ora, fs-extra, glob, TypeScript at runtime) without an explicit decision.
4. No secrets in the repo.
