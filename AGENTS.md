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

- Registry `>= 3` is per-runtime: `r/{react,vue,svelte,solid,webcomponent,templ,latte,twig,jinja2}/`. Default version = CLI major (`@3`), not `@latest`.
- Bricks install to `{dir}/ui/<brick>/`; utils to `{dir}/utils` (bricks import `../../utils`).
- `registry:rules` is installed by `init` only, to `.cursor/rules/ui8kit-primitives.mdc` (`{kit}`, `{globs}` substituted).
- templ/latte/twig/jinja2 are first-class 3.x runtimes (`r/<runtime>/`), see `src/utils/server-runtime.ts`:
  - no `package.json` is created or required; item npm `dependencies` are never npm-installed for them;
  - go/composer/pip deps come from item `meta` (`meta.go.require`, `meta.composer.require`, `meta.python.requirements`) and are only **printed** (once, deduped). Never run them on the user's behalf unless asked;
  - templ: `github.com/ui8kit/codegen/generated/templ/utils` is rewritten to `<go.mod module>/<utils dir>` at plan time (so lock/check hashes include it); no go.mod → warning with manual fix;
  - templ: `*_templ.go` is build output of `templ generate` (not shipped by the registry); tell users to run it after `add`;
  - twig/latte: PSR-4 snippet printed from `meta.composer.autoload` (`<dir>` substituted); `composer.json` is never modified.
- `--import-style package` is deprecated (warns).

## Rules

1. Read the code before changing it; do not invent flags or APIs.
2. The `--runtime` multi-file filter is for `registry:ui` primitives; publish other item types single-stack.
3. No heavy deps (chalk, ora, fs-extra, glob, TypeScript at runtime) without an explicit decision.
4. No secrets in the repo.

## Working in an app that uses ui8kit (agents)

Consumer projects have `ui8kit.config.json` and a committed `ui8kit.lock.json`.

1. **Never edit files listed in `ui8kit.lock.json`** (kit folder `{dir}/ui/…`, `{dir}/utils/…`, `.cursor/rules/ui8kit-primitives.mdc`). Primitives are not forked.
2. **Style via `className` and tokens** (CSS variables, Tailwind theme). Put new UI in the app's own components, not in the kit folder.
3. **After `ui8kit add` (or `init`), run `npx ui8kit@3 check`** and fix errors before finishing.
4. **Do not hand-edit `ui8kit.lock.json`.** It is written by `init` / `add` / `check --adopt`.
5. **Never switch the registry version silently** (`registryVersion`, `--registry-version`, `registryUrl`). Changing it is a user decision; propose it and say why.

Resolving `check` errors:

| Error | Do |
|-------|----|
| `no-lock` | existing install: `npx ui8kit@3 check --adopt`, report `not-adopted` files to the user |
| `missing` | `npx ui8kit@3 add <name> --force` |
| `modified` | revert with `add <name> --force` and re-apply the change via `className` / tokens. If `aliases` / `importStyle` / `paths` changed on purpose, re-install the affected items with `--force` |
| `mixed-versions` | `npx ui8kit@3 add <outdated items> --force` at the current registry version, not a new one |
| `rules-version` | re-run `npx ui8kit@3 init` with the project's flags (rules + utils), or align the primitives; ask before changing the version |
