# CLI smoke + registry workflow log

## 2026-03-07

### 1) Bootstrap / build
- Executed in repo root: `npm install` (dependencies installed).
- Built local CLI: `npm run build`.
- Verified dist artifacts:
  - `dist/index.js`
  - `dist/index.d.ts`
  - `dist/index.js.map`

### 2) Scan source registry (`@.workflow/ui8kit-core`)
- Command: `node dist/index.js --cwd .workflow/ui8kit-core scan --source src --output src/registry.json`
- Result:
  - Scanned components: `28`
  - Types: `registry:ui: 12`, `registry:composite: 5`, `registry:variants: 8`, `registry:lib: 3`
  - Dependency summary: `5 unique (react, lucide-react, class-variance-authority, clsx, tailwind-merge)`
- Integrity check of generated `.workflow/ui8kit-core/src/registry.json`:
  - Total items: `28`
  - `registryDependencies` field present/recognized
  - `variants/lib/` entries with no dependency metadata:
    - `registry:variants:index`
    - `registry:lib:utility-props`
    - `registry:lib:utility-props.map`
  - Unique `registryDependencies` overall: `0` (no unresolved or unresolved references found)

### 3) Build registry from scanned source
- Command: `rm -rf .workflow/registry/r && node dist/index.js --cwd .workflow/ui8kit-core build src/registry.json --output ../registry/r`
- Result:
  - Rebuilt registry successfully to `.workflow/registry/r`
  - `ui8kit.map.json` generated
  - `schema.json` generated
  - Files confirmed present:
    - `.workflow/registry/r/index.json`
    - `.workflow/registry/r/components/*.json`
    - `.workflow/registry/r/lib/*.json`

### 4) Verify registry index enrichments (build metadata)
- Parsed `.workflow/registry/r/index.json`:
  - total entries: `28`
  - every entry has `dependencies: []` and `registryDependencies: []` arrays when applicable (no invalid/missing fields)
  - entries with non-empty dependency metadata in `lib/variants`: `8`

### 5) Local command-run using built dist against `@.workflow/vite-app`
- Started temporary local server: `python -m http.server 4173 --directory .workflow/registry` to make local registry URL `http://127.0.0.1:4173/r`
- Command: `node dist/index.js --cwd .workflow/vite-app init --yes --registry-url http://127.0.0.1:4173/r --strict-cdn`
  - Result: `init` succeeded, `src/lib`, `src/variants`, `src/components/ui`, `src/components`, `src/layouts`, `src/blocks` created.
- Command: `node dist/index.js --cwd .workflow/vite-app add --all --registry-url http://127.0.0.1:4173/r --strict-cdn --registry ui`
  - Result: `17` components installed.
  - Component summary from output: `Title, Text, Stack, Image, Icon, Group, Field, Container, Button, Box, Block, Badge, Sheet, Grid, Card, Accordion, index + utility variants/files`
  - Dependency install behavior:
    - preexisting deps resolved instantly (`react`)
    - additional install done once for `lucide-react`
- Post-install filesystem check (`find .workflow/vite-app/src ...`):
  - Installed files include:
    - `src/components/{Accordion,Card,Grid,Sheet,index,ui/*, ...}`
    - `src/lib/{utils.ts, utility-props.ts, utility-props.map.ts}`
    - `src/variants/*`
- Post-install dependency check in `vite-app/package.json`:
  - `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` present

### 6) Important command checks
- `node dist/index.js --cwd .workflow/vite-app info --json`
  - Status: config found, registry override persisted, CDN ok, cache path resolved
  - Cache item count before clear: `36` (size `0.1 MB`)
- `node dist/index.js --cwd .workflow/vite-app list --json --registry-url http://127.0.0.1:4173/r --strict-cdn`
  - Received 17 registry items (only `registry:ui` + `registry:composite` entries in list payload)
- `node dist/index.js --cwd .workflow/vite-app diff --json --registry-url http://127.0.0.1:4173/r --strict-cdn`
  - All previously installed components reported `up-to-date`
- `node dist/index.js --cwd .workflow/vite-app add button --dry-run --registry-url http://127.0.0.1:4173/r --strict-cdn`
  - Correctly shows single-item dependency tree, no modifications applied
- `node scripts/get-cdn.js --url http://127.0.0.1:4173/r --path components/variants/index.json`
  - OK against local URL and fallback providers

### 7) Cleanup command checks
- `node dist/index.js --cwd .workflow/vite-app registry clean --all --dry-run` → no generated artifacts found (informational response)
- `node dist/index.js --cwd .workflow/vite-app cache clear` → cache cleared successfully
- `node dist/index.js --cwd .workflow/vite-app reset --yes`
  - Removed:
    - `ui8kit.config.json`
    - `src/components`
    - `src/lib`
    - `src/variants`
    - `src/layouts`
    - `src/blocks`

### 8) Server teardown
- Stopped local HTTP server process (PID `3101`).

### 9) Command outcome matrix

| Command | Expected | Actual | Result |
| --- | --- | --- | --- |
| `node dist/index.js --cwd .workflow/ui8kit-core scan --source src --output src/registry.json` | Generate manifest with component/dependency metadata | 28 items generated, dependency summary includes 5 unique packages | ✅ Pass |
| `scan` result integrity validation (`registryDependencies` + component counts) | `registryDependencies` collected and resolvable, no structural issues | Metadata fields present, no unresolved registry dependency failures detected | ✅ Pass |
| `node dist/index.js --cwd .workflow/ui8kit-core build src/registry.json --output ../registry/r` | Rebuild local registry artifacts | Output rebuilt at `.workflow/registry/r`, map and schema generated | ✅ Pass |
| Local registry availability (`http://127.0.0.1:4173/r`) | Registry serves payloads for `components/*` paths | `curl -I` and `get-cdn` checks succeeded | ✅ Pass |
| `init --yes --registry-url http://127.0.0.1:4173/r --strict-cdn` | Initialize `vite-app` with core files | Init completed successfully | ✅ Pass |
| `add --all --registry-url http://127.0.0.1:4173/r --strict-cdn` | Install all registry components + required dependencies | 17 components installed; package install triggered for missing `lucide-react` | ✅ Pass |
| `diff --json --registry-url ... --strict-cdn` after fresh install | All items reported as up-to-date | All installed components up-to-date | ✅ Pass |
| `add button --dry-run --registry-url ... --strict-cdn` | Plan-only output without writes | Dependency tree and target file path shown, no file writes | ✅ Pass |
| `registry clean --all --dry-run` in app context | Show removable generated artifacts | Returned informational `No generated registry artifacts found` | ⚠️ Informational |
| `cache clear` | Clear cache successfully | Cache cleared | ✅ Pass |
| `reset --yes` | Remove `ui8kit` project state | Removed config and directories (`components`, `lib`, `variants`, `layouts`, `blocks`) | ✅ Pass |

### 10) Reproducible runbook (local smoke check)

```bash
# 1) Install deps and build CLI once
npm install
npm run build

# 2) Scan and build local registry from source package
node dist/index.js --cwd .workflow/ui8kit-core scan --source src --output src/registry.json
rm -rf .workflow/registry/r
node dist/index.js --cwd .workflow/ui8kit-core build src/registry.json --output ../registry/r

# 3) Start temporary local registry server
python -m http.server 4173 --directory .workflow/registry

# 4) Run app init and bulk install against local registry
node dist/index.js --cwd .workflow/vite-app init --yes --registry-url http://127.0.0.1:4173/r --strict-cdn
node dist/index.js --cwd .workflow/vite-app add --all --registry-url http://127.0.0.1:4173/r --strict-cdn

# 5) Smoke checks
node dist/index.js --cwd .workflow/vite-app info --json
node dist/index.js --cwd .workflow/vite-app list --json --registry-url http://127.0.0.1:4173/r --strict-cdn
node dist/index.js --cwd .workflow/vite-app diff --json --registry-url http://127.0.0.1:4173/r --strict-cdn
node dist/index.js --cwd .workflow/vite-app add button --dry-run --registry-url http://127.0.0.1:4173/r --strict-cdn

# 6) Cleanup
node dist/index.js --cwd .workflow/vite-app cache clear
node dist/index.js --cwd .workflow/vite-app reset --yes
```

```bash
# Optional CDN diagnostics
node scripts/get-cdn.js --url http://127.0.0.1:4173/r --path components/variants/index.json
```

### 11) Scripted mode (local smoke run)

- Windows PowerShell:

```powershell
.\scripts\smoke-cli-workflow.ps1 -Port 4173
```

- Unix-like / WSL:

```bash
./scripts/smoke-cli-workflow.sh 4173
```
