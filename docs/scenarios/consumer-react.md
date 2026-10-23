# Scenario: React consumer app

Install UI primitives into a Vite/Next/CRA-style React app so Tailwind sees source classes.

## Goals

- Create `ui8kit.config.json`
- Install `button` (+ registry deps) under `src/`
- Wire Tailwind `content` to kit paths

## Steps

### 1. Init

```bash
cd my-react-app
npx ui8kit init --yes --framework react --dir src --runtime react
```

Expected:

```text
ui8kit.config.json
src/lib/
src/utils/
src/components/
src/ui/
src/blocks/
src/layouts/
src/variants/
src/widgets/
```

If the public CDN is unreachable, re-run with your registry:

```bash
npx ui8kit init --yes --framework react --dir src \
  --registry-url https://cdn.example.com/ui8kit/r \
  --strict-cdn
```

### 2. List and add

```bash
npx ui8kit list
npx ui8kit add button
```

Force overwrite after upstream changes:

```bash
npx ui8kit add button --force
```

### 3. Tailwind

```js
// tailwind.config.js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
}
```

### 4. Use in code

```tsx
import { Button } from "@/ui/button"
// exact path depends on aliases + installed file layout
```

Align `tsconfig` / Vite `resolve.alias` with `ui8kit.config.json` → `aliases`.

### 5. Upgrade check

```bash
npx ui8kit diff button
npx ui8kit add button --force   # when you accept changes
```

## Config snapshot

```json
{
  "contractVersion": "2.0.0",
  "framework": "react",
  "runtime": "react",
  "typescript": true,
  "globalCss": "src/index.css",
  "dir": "src",
  "importStyle": "alias"
}
```

## Pitfalls

- Importing from a published npm UI package **and** from kit folders doubles sources — pick one delivery model (prefer kit folders for Tailwind).
- Forgetting Tailwind `content` → missing utility classes in production CSS.
