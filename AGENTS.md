# AGENTS.md — ui8kit CLI 3.x

<!-- ui8kit-ecosystem:start -->
> **UI8Kit 3 ecosystem**
>
> - [github.com/ui8kit/codegen](https://github.com/ui8kit/codegen) — generator of primitives (spec → `generated/`)
> - [github.com/ui8kit/registry](https://github.com/ui8kit/registry) — packed per-runtime registry on npm/CDN — [npm `@ui8kit/registry`](https://www.npmjs.com/package/@ui8kit/registry)
> - [github.com/ui8kit/cli](https://github.com/ui8kit/cli) — installer `ui8kit` — [npm `ui8kit`](https://www.npmjs.com/package/ui8kit)  ← **you are here**
>
> Pipeline: codegen (spec → `generated/`) → registry (pack `r/<rt>/`) → CDN (unpkg / jsDelivr) → cli (`init` / `add`) → app
<!-- ui8kit-ecosystem:end -->

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

<!-- ui8kit-install:start -->
## Installing primitives with the ui8kit CLI

This repo **is** the installer. Exact flags below are taken from `src/index.ts` (verified with `node dist/index.js <cmd> --help`).

### Quick start per runtime

Always call the CLI with a pinned major: `npx ui8kit@3`. `add all` and `add --all` are equivalent.

```bash
# JS runtimes (writes package.json peers clsx + tailwind-merge for utils)
npx ui8kit@3 init --yes --framework react        --dir src && npx ui8kit@3 add button
npx ui8kit@3 init --yes --framework vue          --dir src && npx ui8kit@3 add button
npx ui8kit@3 init --yes --framework svelte       --dir src && npx ui8kit@3 add button
npx ui8kit@3 init --yes --framework solid        --dir src && npx ui8kit@3 add button
npx ui8kit@3 init --yes --framework webcomponent --dir src && npx ui8kit@3 add button
npx ui8kit@3 add --all            # everything in r/<runtime>/index.json

# Server runtimes (no package.json is written or required)
npx ui8kit@3 init --yes --framework templ  --dir internal  && npx ui8kit@3 add button
npx ui8kit@3 init --yes --framework twig   --dir templates && npx ui8kit@3 add button
npx ui8kit@3 init --yes --framework latte  --dir templates && npx ui8kit@3 add button
npx ui8kit@3 init --yes --framework jinja2 --dir templates && npx ui8kit@3 add button
```

Post-install for server runtimes (the CLI prints the exact commands from item `meta`; it never runs them and never edits `composer.json` / `go.mod`):

- **templ**: `go get github.com/a-h/templ@<printed version>` → `templ generate` (after every `add`, and in CI; `*_templ.go` is generated, not shipped) → `go build ./...`. With `go.mod` present the utils import is rewritten to `<module>/<dir>/utils`.
- **twig / latte**: `composer require "twig/twig:^3.0"` (or the printed latte package), add the printed PSR-4 entry to `composer.json`, then `composer dump-autoload`:
  ```json
  { "autoload": { "psr-4": { "UI8Kit\\Twig\\": "templates/runtime/" } } }
  ```
  (`UI8Kit\\Latte\\` for latte). Twig: `$twig->addExtension(new \UI8Kit\Twig\TwigExtension())`.
- **jinja2**: `pip install "Jinja2>=3.1,<4"`; `from ui8kit_jinja import environment` → `environment().get_template("ui/button/button.html.j2").render(p={...}, children=...)`.

### Commands and flags (ui8kit 3.2)

Global: `-c, --cwd <dir>`, `-v, --verbose`, `--no-cache`, `-V, --version`.

| Command | Flags |
|---------|-------|
| `init` | `-y, --yes`, `--framework <react\|vue\|svelte\|solid\|webcomponent\|templ\|latte\|twig\|jinja2\|none>`, `--runtime <name>` (defaults to framework), `--dir <path>`, `--skip-core`, `-r, --registry <type>` (default `ui`), `--registry-url <url>`, `--registry-version <v>`, `--strict-cdn`, `--import-style <alias\|package>` (`package` deprecated) |
| `add [components...]` | `-a, --all` (or `add all`), `-f, --force`, `--runtime <name>`, `--path <key=dir>` (repeatable, e.g. `ui=kit`), `--dry-run`, `--retry`, `-r, --registry <type>`, `--registry-url`, `--registry-version`, `--strict-cdn` |
| `check` | offline verify vs `ui8kit.lock.json`; `--json`, `--adopt` (fetches registry, adopts only matching files), `--runtime`, `--registry-url`, `--registry-version`, `--strict-cdn` (the last three only with `--adopt`) |
| `list` | `--json`, `-r, --registry`, `--registry-url`, `--registry-version`, `--strict-cdn` |
| `diff [component]` | `--json`, `-r, --registry`, `--registry-url`, `--registry-version`, `--strict-cdn` |
| `info` | `--json`, `--cdn` (resolved CDN order and overrides) |
| `scan` | `-r, --registry <type\|path>`, `-o, --output <file>`, `-s, --source <dir>` |
| `build [registry]` | default `./src/registry.json`; `-o, --output <path>` (default `./packages/registry/r`) |
| `cache clear` | — |
| `registry clean` | `--dry-run`, `--all`, `-f, --force` |
| `reset` | `--dry-run`, `--with-cache`, `-y, --yes`, `-f, --force` |

## Where registries live

- **Default**: `@ui8kit/registry@<CLI major>` from npm via CDN, tried in order **unpkg → jsDelivr**:
  - `https://unpkg.com/@ui8kit/registry@3/r/<runtime>/index.json`
  - `https://cdn.jsdelivr.net/npm/@ui8kit/registry@3/r/<runtime>/index.json`
- **Per runtime** (`react`, `vue`, `svelte`, `solid`, `webcomponent`, `templ`, `twig`, `latte`, `jinja2`) under `r/<runtime>/`:
  - `index.json` — catalogue
  - `components/ui/<name>.json` — primitives (e.g. `button.json`)
  - `utils/utils.json` — `registry:utils` (installed by `init`)
  - `rules/rules.json` — `registry:rules` → `.cursor/rules/ui8kit-primitives.mdc` (installed by `init`)
- **`$schema`**: `https://cdn.jsdelivr.net/npm/@ui8kit/registry@3/schema/{schema,registry,registry-item}.json` (config / index / item).
- **Version**: `--registry-version` or `"registryVersion"` in `ui8kit.config.json` accepts exact (`3.1.0`), range (`3.1`) or dist-tag (`canary`); default is the CLI major (`3` → newest 3.x.y).

### Version with a custom `--registry-url`

`--registry-version` / `registryVersion` rewrites an npm-style `name@<version>` segment of a custom URL (`…/@ui8kit/registry@latest/r/react`, `…/my-kit@2/r`, `…@3.1.0/…`). A URL without such a segment (brand domain, self-hosted path like `https://kit.example.com/v3/r/react`) is used unchanged and the CLI warns that `--registry-version` is ignored: version those registries through their own path.

### `slot` is React-only

`slot` (Slot / `asChild`) exists only in `r/react`; React bricks pull it in via `registryDependencies`. Other runtimes compose with their native mechanism (slots/children), so `add slot --runtime vue` (or any non-React runtime) prints a clear "React-only" error and skips it.
- **Resolution order**: `--registry-url` / `registryUrl` → `cdnBaseUrls` (config) → built-in unpkg / jsDelivr. With `--strict-cdn` (or `strictCdn`) and an explicit URL, only that URL is used.
- **Brand registries**: `@ui8kit/registry` ships **primitives only**. Brand kits (blocks, composites) host their own registry, e.g. `--registry-url https://registry.buildy.tw/react`, and reference primitives by absolute URL in `registryDependencies` (pinned digest, recorded in `meta.primitives`). Brand items get their own lock entries.
- **Lock**: `init` / `add` write `ui8kit.lock.json` (source URL, exact version, sha256 per file). Commit it; verify with `npx ui8kit@3 check` (offline, exit 1 on `missing` / `modified` / `mixed-versions` / `rules-version`). No lock yet → `npx ui8kit@3 check --adopt` once.

### Where source lives

```
codegen  specs/ + bricks/ ─gen─▶ generated/<rt>/   (build output, NOT committed)
registry pack:runtimes  ──────────▶ r/<rt>/*.json     (published: @ui8kit/registry)
npm ──▶ unpkg / jsDelivr ──▶ cli: ui8kit init / add ──▶ app {dir}/ui, {dir}/utils + ui8kit.lock.json
```

Fix a primitive in **codegen**, repack in **registry**, publish, then `add <name> --force` in the app. Never fix it in the app or in `r/` by hand.

### Rules for agents (imperative)

- Always pin the major: `npx ui8kit@3 …`, never bare `npx ui8kit`.
- Install primitives only via `init` / `add`; never copy files from `r/` or `generated/` by hand.
- Never edit `ui8kit.lock.json` manually; never edit files under `{dir}/ui` or `{dir}/utils` — style via `className` / tokens.
- Run `npx ui8kit@3 check` before every commit; fix drift with `add <name> --force`.
- Upgrade deliberately: change `registryVersion`, `add --all --force`, re-run `init` (rules), `check`, commit.
- `children` passed to server-template primitives is trusted HTML (not escaped) — escape user input yourself.
- Server runtimes: after `add`, run the printed toolchain steps (`templ generate`, `composer dump-autoload`, `pip install`).
- New UI that is not a primitive goes to a brand registry (`--registry-url`), never into `@ui8kit/registry`.
<!-- ui8kit-install:end -->
