# Getting started

## Requirements

- **Node.js `>=20`** (or Bun with a Node-compatible runner)
- A project directory (CLI can create a minimal `package.json` on `init`)
- Network access to a registry CDN, **or** a local registry URL

No Vite, React, or specific bundler is required.

## Install / run

You do not need a global install. Prefer one-shot runners:

```bash
# npm
npx ui8kit@3 --help

# Bun
bunx ui8kit@3 --help

# After adding as a devDependency
npm i -D ui8kit
npx ui8kit --help
```

Global (optional):

```bash
npm i -g ui8kit
ui8kit --version
```

## First project in five minutes

### 1. Initialize

From your app root:

```bash
npx ui8kit init --yes --framework react --dir src
```

This creates:

- `ui8kit.config.json` — project contract
- `src/utils/` (registry utils) and `.cursor/rules/ui8kit-primitives.mdc` (agent rules); only folders of written files are created
- Optionally pulls **core** registry items (`registry:lib` / `utils` / `variants`) when the CDN is reachable

Skip core fetch (offline / custom later):

```bash
npx ui8kit init --yes --framework none --dir src --skip-core
```

### 2. Inspect environment

```bash
npx ui8kit info
npx ui8kit info --cdn
npx ui8kit info --json
```

### 3. Browse the registry

```bash
npx ui8kit list
npx ui8kit list --json
```

### 4. Install a component

```bash
npx ui8kit add button
```

Files are written under `{dir}/…` (default `src/`), preserving nested paths from the registry item `target` / `path`.

Preview without writing:

```bash
npx ui8kit add button --dry-run
```

### 5. Compare with upstream

```bash
npx ui8kit diff button
npx ui8kit diff --json
```

## Point Tailwind at kit files

Because sources live in your repo, include the install root in Tailwind content / `@source`:

```js
// tailwind.config.js (v3)
content: ["./src/**/*.{js,ts,jsx,tsx,svelte,vue}"]
```

```css
/* Tailwind v4 */
@source "../src/**/*.{js,ts,jsx,tsx,svelte,vue}";
```

Adjust paths if `dir` is `web/src` or `internal`.

## Global CLI flags

Available on every command:

| Flag | Meaning |
|------|---------|
| `-c, --cwd <dir>` | Run as if started in that directory |
| `-v, --verbose` | Extra diagnostic logs |
| `--no-cache` | Bypass `~/.ui8kit/cache` for registry fetches |

Example:

```bash
npx ui8kit --cwd ./apps/web add button --no-cache
```

## Next steps

- Configure CDN / pins → [Configuration](./configuration.md)
- Full command reference → [Commands](./commands.md)
- Pick a scenario → [Scenarios](./scenarios/)
