# AGENTS.md — working on ui8kit CLI

This repo is the **`ui8kit`** npm package: a shadcn-style CLI that installs registry JSON into app source trees.

**Before changing consumer `add` / `paths` / utils behavior**, read `.project/` — especially:

1. [.project/status.md](./.project/status.md) — what is published
2. [.project/known-issues.md](./.project/known-issues.md) — P0 bugs (utils exclude, paths+target)
3. [.project/architecture.md](./.project/architecture.md) — data flow
4. [.project/refactor-backlog.md](./.project/refactor-backlog.md) — deferred brainstorm (do not drive-by unless asked)
5. [.project/anti-overengineering.md](./.project/anti-overengineering.md) — primitives wall vs shadcn-plain rest

## Stack

- TypeScript ESM, Node `>=20`
- Runtime deps: `commander`, `prompts`, `zod` only
- Build: `tsup` → `dist/`; tests: Vitest 4
- Package name: `ui8kit` (bin `ui8kit`)

## Commands

| Action | Command |
|--------|---------|
| Install | `npm install` |
| Typecheck | `npm run type-check` |
| Test | `npm test` |
| Build | `npm run build` |
| Pack dry-run | `npm run pack:check` |

Run **typecheck + test + build** before declaring CLI changes done.

## Repo map

| Path | What |
|------|------|
| `src/commands/` | `init`, `add`, `list`, `diff`, `scan`, `build`, … |
| `src/registry/` | fetch, schemas, build schema |
| `src/utils/paths.ts` | install path resolution (`target` vs `paths`) |
| `src/utils/runtime-files.ts` | `--runtime` file filter (primitives) |
| `src/utils/transform.ts` | `@/` import rewrite only (not relative `../../utils`) |
| `docs/` | English user docs |
| `.project/` | Maintainer / agent SoT for status & refactor |

## Ecosystem (sibling work)

| Repo / path | Role |
|-------------|------|
| `@ui8kit/registry` (`e:\_@Bun\@ui8kit-registry`) | Published digest `/r` — CDN source of truth for bricks + utils |
| `ui8kit-codegen` | Primitive SoT (`generated/ui`, `generated/utils`) |
| `@TestApp` | Consumer smoke (Vite/Svelte/Bun) |

CDN:

```text
https://unpkg.com/@ui8kit/registry@2.0.0/r/index.json
https://unpkg.com/@ui8kit/registry@2.0.0/r/utils/utils.json
https://unpkg.com/@ui8kit/registry@2.0.0/r/components/ui/<name>.json
```

## Scaffolding a new app (agents) — utils + UI

Until the utils/`add` bug is fixed (`ADD_EXCLUDED_COMPONENT_TYPES` in `src/commands/add.ts`):

1. **`init` without `--skip-core`** so utils install via `installCoreFiles`
2. Pin `registryUrl` to `https://unpkg.com/@ui8kit/registry@2.0.0/r` + `strictCdn` / `runtime`
3. Keep **`utils` at `{dir}/utils`** (bricks use `../../utils`)
4. `add <bricks> --runtime <stack> --force`
5. `bun add clsx tailwind-merge` (or npm) if not pulled
6. Verify `src/utils/cn.ts` exists before wiring UI imports

If `--skip-core` was used or utils missing: fetch `r/utils/utils.json` and write each `files[].content` to `{dir}/{files[].target}` (see README “Manual utils fallback”).

Do **not** set `paths.utils` to `kit/utils` without import rewrite. Optional kit layout: move `components/ui` → `kit` after add; leave utils where they are. In 2.0.1, `paths.ui` is ignored when registry `target` is set.

Full recipe: [README.md — New app](./README.md#new-app--utils--ui-recommended).

## Hard rules

1. **Primitives wall:** multi-runtime file filter is for `registry:ui` (+ shared assets). Do not invent the same heuristics for future blocks/widgets — publish those single-stack.
2. **Contract additive:** prefer patch fixes (`2.0.2`) over breaking `contractVersion` unless brainstorm says otherwise.
3. **No restore of heavy deps** (TypeScript-as-runtime, chalk/ora/fs-extra/glob, AST utility-map) without an explicit decision.
4. **Secrets:** none in this repo; never commit tokens.
5. **Refactor pause:** as of 2026-08-11, consumer P0 fixes are documented but **deferred** to the next brainstorm unless the user explicitly asks to implement them.

## Definition of done (CLI change)

- `npm test` + `npm run type-check` + `npm run build` green
- Docs/README/CHANGELOG updated if behavior changed
- If touching `add` / paths / utils: note impact in `.project/known-issues.md` or mark issue fixed
- Prefer a small fixture or TestApp check: utils on disk + one brick for chosen `--runtime`
