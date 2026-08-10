# Scenario: Multi-runtime digests (Svelte / Vue / Solid)

Use when the registry publishes the same logical components for several runtimes.

## Goals

- Pin `framework` + `runtime` in config
- Install only matching runtime files
- Optionally remap UI into a `kit/` folder

## Svelte example

```bash
cd my-svelte-app
npx ui8kit init --yes --framework svelte --runtime svelte --dir web/src
```

`ui8kit.config.json` (edited):

```json
{
  "contractVersion": "2.0.0",
  "framework": "svelte",
  "runtime": "svelte",
  "dir": "web/src",
  "paths": {
    "ui": "kit",
    "utils": "kit/utils"
  },
  "globalCss": "web/src/app.css",
  "registryUrl": "https://cdn.example.com/ui8kit/r",
  "registryVersion": "0.2.0",
  "strictCdn": true
}
```

Install:

```bash
npx ui8kit add button card --runtime svelte
```

Files land under `web/src/kit/…` and `web/src/kit/utils/…`.

### Tailwind / Vite

```js
// vite.config.ts — alias example
resolve: {
  alias: {
    "@": path.resolve("web/src"),
    "@/ui": path.resolve("web/src/kit"),
  },
}
```

```css
@source "./kit/**/*.{svelte,ts}";
```

## Solid / Vue

Same pattern; change flags:

```bash
npx ui8kit init --yes --framework solid --runtime solid --dir src
npx ui8kit add button --runtime solid

npx ui8kit init --yes --framework vue --runtime vue --dir src
npx ui8kit add button --runtime vue
```

## Digest selection strategies

| Strategy | How |
|----------|-----|
| Item `runtime` field | `add --runtime svelte` filters items |
| Separate CDN bases | `registryUrl` per stack |
| npm version / dist-tag | `--registry-version 0.2.0-svelte` if URLs use `@latest` |

## Pitfalls

- Mixing runtimes in one `dir` without separate `paths` causes file collisions (`Button.tsx` vs `Button.svelte`).
- Always pass `--runtime` in CI for multi-stack registries.
