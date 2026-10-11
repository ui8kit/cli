# Known issues — confirmed on TestApp smoke (2026-08-11)

> **2.0.2 (branch `fix/registry-gaps`)**: P0-1 (utils/lib via `registryDependencies`) and P0-2 (`paths` + `target`) are fixed; runtime filter keeps type files; type-only cycles are quiet. See CHANGELOG. P0-3 (relative imports vs remap) remains by design: remap at the same depth.

Severity: **P0** blocks shadcn-like DX · **P1** layout / stack · **P2** polish.

---

## P0-1 — `utils` / `lib` / `variants` excluded from `add` fetch

**Symptom:** `ui8kit add utils` → not found. `add button` does **not** install `registryDependencies: ["utils"]`. App bricks import `../../utils` → missing modules unless utils installed another way.

**Root cause:** `src/commands/add.ts` sets

```ts
const ADD_EXCLUDED_COMPONENT_TYPES = ["registry:variants", "registry:lib", "registry:utils"]
```

and passes `excludeTypes` into **both** listing and `getComponent`. In `src/registry/api.ts` `getComponentByType`, index lookup skips excluded types → returns `null`. Dependency resolver then logs “not found, skipping”.

**Intent that went wrong:** hide core types from interactive list / `--all` catalog. Correct design: exclude from **catalog UI only**, never from explicit name fetch or `registryDependencies`.

**Workaround today:**

- `init` **without** `--skip-core` (uses separate `installCoreFiles` in `init.ts`), **or**
- Manual download of `https://unpkg.com/@ui8kit/registry@2.0.0/r/utils/utils.json` and write `files[].content` to `files[].target` under `dir`.

**Fix direction (deferred):** split `LIST_EXCLUDED` vs fetch options; resolver must always resolve utils.

---

## P0-2 — `config.paths` ignored when `target` is set

**Symptom:** `paths: { "ui": "kit" }` still installs to `src/components/ui/…`.

**Root cause:** `resolveFileInstallPath` (`src/utils/paths.ts`) early-returns on `file.target` with `join(dir, target)` and never consults `resolveTypeFolder` / `config.paths`. Current digest **always** sets targets like `components/ui/button/Button.svelte`.

**Workaround today:** after `add`, move `src/components/ui/*` → `src/kit/` (TestApp). Keep `src/utils` in place so `../../utils` from `kit/<brick>/` still resolves.

**Fix direction (deferred):** when remapping, rewrite known canonical prefixes on target:

```text
components/ui/…  →  {paths.ui}/…
utils/…          →  {paths.utils}/…   # only if you also rewrite imports — see P0-3
```

Prefer **minimal** remap: only `components/ui` → `kit`; leave utils at `{dir}/utils`.

---

## P0-3 — Relative imports vs path remap

**Symptom:** bricks contain `from "../../utils"` / `from "../../utils/expr"`. Transform (`src/utils/transform.ts`) only rewrites `@/…`. Moving utils under `src/kit/utils` without import rewrite breaks builds.

**Canonical safe layout:**

```text
{dir}/kit/<brick>/Button.svelte   # or components/ui/…
{dir}/utils/cn.ts                 # MUST stay as sibling of components|kit parent
# from kit/button: ../../utils → {dir}/utils  ✓
```

**Anti-pattern without rewrite:** `paths.utils = "kit/utils"`.

---

## P1-1 — `slot` is React-only

**Symptom:** `--runtime svelte` → `skip slot (no files for runtime svelte)`.

**Fact:** `r/components/ui/slot.json` only ships `slot.tsx`. Some UI items list `slot` in `registryDependencies`. For Svelte the skip is correct; warn quality is weak (silent dependency hole for React-asChild patterns that don’t exist on Svelte).

---

## P1-2 — `utils` ships Go sources into JS apps

**Fact:** `registry:utils` is never runtime-sliced. Installing utils drops `*.go` beside `*.ts`. Harmless for Vite if unused; noisy tree.

**Fix direction (optional):** filter utils files by consumer runtime/family (JS vs Go) at add time, or publish split utils digests.

---

## P1-3 — `init --skip-core` + `add` = empty utils

Compound of P0-1. TestApp used `--skip-core` then discovered utils missing.

---

## P2 — smaller surprises

| Issue | Notes |
|-------|-------|
| Empty scaffold dirs | `init` creates lib/blocks/layouts/variants/widgets even if unused |
| Default `globalCss: src/index.css` | Many apps use `app.css` |
| No `components/index.json` on CDN | `add --all` optional index install → “not found” info |
| `scan` unfit for codegen multi-runtime | Use registry `pack-from-codegen`, not stock scan |
| No CI e2e against live `@ui8kit/registry` | Unit tests exist; consumer CDN→build smoke was manual |
| Without `--force`, existing files skipped | Easy to think add updated when it didn’t |
| npm deps on UI items often `[]` | `clsx` / `tailwind-merge` live on utils item |

---

## Evidence trail

- Smoke: `e:\_@Bun\@TestApp\` + `README.md` notes
- CLI: `src/commands/add.ts` (`ADD_EXCLUDED_COMPONENT_TYPES`), `src/registry/api.ts` (`excludeTypes`), `src/utils/paths.ts` (`file.target` branch), `src/utils/runtime-files.ts`
- Registry: `e:\_@Bun\@ui8kit-registry\r\`
