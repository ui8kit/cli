# scripts/

Maintainer utilities. **Not** published to npm (`files` only ships `dist` + docs).

| Script | npm script | Purpose |
|--------|------------|---------|
| `get-cdn.js` | `npm run get-cdn` | Probe registry CDN bases (`index.json`, utils, sample UI paths) |
| `smoke-cli-workflow.sh` / `.ps1` | `npm run smoke` / `smoke:win` | Local e2e with `.workflow/` fixtures |
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

## Optional smoke

Needs gitignored `.workflow/ui8kit-core` and `.workflow/vite-app`. Skip for a normal release if unit/integration tests pass.
