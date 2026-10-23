# scripts/

Maintainer utilities. **Not** published to npm (`files` only ships `dist` + docs).

| Script | npm script | Purpose |
|--------|------------|---------|
| `get-cdn.js` | `npm run get-cdn` | Probe 3.x CDN bases per runtime (`r/<runtime>/index.json`, `utils/utils.json`, `rules/rules.json`, a sample brick). `--runtime`, `--registry-version`, `--path`, `--url` |
| `e2e-fixture-registry.mjs` | `npm run test:e2e` | Built CLI against a synthetic static registry (svelte, react): runtime filter, utils deps, `paths` precedence. No network |
| `smoke-cli-workflow.sh` / `.ps1` | `npm run smoke` / `smoke:win` | **Legacy** (2.x era): local e2e with gitignored `.workflow/` fixtures; not maintained for 3.x |
| `node-artifact-cleaner.sh` | `npm run clean:artifacts` | Wipe `node_modules` / `dist` / lockfiles (destructive) |
| `run-vitest.mjs` | `npm test` | Vitest wrapper — uppercases Windows drive letter (Vitest bug) |

## Publish gate (required)

```bash
npm run type-check
npm test
npm run build
npm run pack:check
```

`prepublishOnly` runs type-check + test + build. `prepack` ensures `dist` exists before `npm pack` / publish.

## Optional smoke (legacy)

Needs gitignored `.workflow/ui8kit-core` and `.workflow/vite-app`. Skip for a normal release if unit/integration tests pass.
