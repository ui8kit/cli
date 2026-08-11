# Decisions (living ADR notes)

## D1 — Delivery model is file-copy, not npm kit packages

**Decision:** Consumers get sources via CLI into the app (Tailwind content paths). Optional `@ui8kit/react`-style packages are **not** required for Wave 0.

**Why:** Matches shadcn; works for Go/templ and non-JS; avoids dual SoT.

---

## D2 — Multi-runtime complexity is confined to primitives

**Decision:** Codegen emits all runtimes into one brick folder; registry JSON embeds all files; CLI `--runtime` filters **files** for `registry:ui`. Future blocks/widgets should publish **single-runtime** items (or separate URL prefixes), not inherit file-extension heuristics.

**Why:** Avoid universal runtime engine for every registry type.

---

## D3 — Utils stay at `{dir}/utils` (canonical)

**Decision:** Prefer not putting utils under `kit/utils` without import rewrite. Safe kit layout:

```text
{dir}/kit/<brick>
{dir}/utils
```

**Why:** Codegen relative imports `../../utils` from brick depth.

---

## D4 — Contract 2.0.0 vs package 2.0.1

**Decision:** `contractVersion` stays `2.0.0`. CLI package `2.0.1` = additive runtime file filter + docs. Next consumer bugfixes → `2.0.2` unless brainstorm chooses feature bump.

---

## D5 — Registry digest is published independently

**Decision:** `@ui8kit/registry` owns `/r`. CLI defaults CDN to `@ui8kit/registry@latest/r`. Registry build uses `npx ui8kit@2.0.1 build` (no sibling CLI required).

**Why:** Consumers and CI can rebuild digest from GitHub codegen without monorepo.

---

## D6 — CLI refactor paused (2026-08-11)

**Decision:** Stop CLI code changes until next brainstorm. CDN primitives+utils are usable with workarounds. Document issues in `.project` instead of rushing patches.

**Why:** Align on anti-overengineering wall before more path/transform complexity.

---

## D7 — `scan` is not the codegen pack path

**Decision:** Multi-runtime `generated/` trees are packed by `ui8kit-registry/scripts/pack-from-codegen.mjs`, not by stock `ui8kit scan`.

**Why:** Scan assumes simpler single-stack component layouts.

---

## D8 — Core types visibility

**Intent (historical):** Hide `lib` / `utils` / `variants` from `list` / interactive pickers.

**Broken implementation:** Same exclude list applied to `getComponent` → deps cannot install utils.

**Future decision needed:** list-hide ≠ fetch-hide (see refactor-backlog A).
