# Refactor backlog — DEFERRED (next brainstorm)

> **Do not implement in drive-by PRs until brainstorm closes.**  
> Goal of this doc: enough detail that a new agent can open a hotfix PR without rediscovering TestApp failures.

## Goal after brainstorm

Restore **shadcn-class consumer DX** for primitives against live CDN, without overengineering blocks/widgets.

Success criteria (definition of done for next CLI patch, likely **2.0.2** or **2.1.0**):

1. `ui8kit add button --runtime svelte --registry-url …@2.0.0/r --strict-cdn`  
   → writes `Button.svelte` + shared + **`utils/*` via registryDependencies**
2. Optional: `paths.ui = "kit"` → files under `{dir}/kit/<brick>/…` (utils remain `{dir}/utils`)
3. Automated e2e (or TestApp script) asserts files exist and `vite build` / `bun run build` passes
4. Docs match behavior (no “paths work” lie; utils not “add-excluded” in consumer guide)

## Proposed patch series (discussion order)

### A. Fetch/deps fix (must-have)

- Introduce `LIST_EXCLUDED_COMPONENT_TYPES` for list / prompt / `--all` catalog only
- **Remove** excludeTypes from `getComponent` used by dependency resolver
- Allow explicit `ui8kit add utils`
- Tests: mock index with utils + button dep → utils files written

### B. Path prefix remap (minimal)

- In `resolveFileInstallPath`, if `config.paths.ui` set and target starts with `components/ui/`, rewrite prefix to remapped folder
- **Do not** remap utils by default
- Document MentorYChat layout: `kit` + top-level `utils`
- Tests: config paths.ui=kit → `src/kit/button/Button.svelte`

### C. Runtime filter scope lock

- Keep file filter for `registry:ui` only (already mostly true)
- Do **not** invent filters for blocks/widgets until those digests exist
- Optional: warn when a `registryDependencies` item installs 0 files for requested runtime (`slot` on svelte)

### D. E2E against real or fixture digest

- Fixture: slim `button` + `utils` JSON in `tests/fixtures/registry/`
- Or opt-in network test against unpkg `@ui8kit/registry@2.0.0`
- Command path: init → add button --runtime svelte → assert disk → optional svelte-check

### E. Explicitly out of scope for this hotfix

- Import rewriting of relative `../../utils`
- Multi-registry types beyond ui
- Widgets / HTMX orchestration
- Making `scan` understand codegen trees
- Splitting CDN per runtime (can stay all-in-one JSON + file filter)
- AST / TypeScript program analysis (intentionally removed in v2)

## Overengineering guard (brainstorm checklist)

Before accepting a design:

1. Is this needed for **primitives + utils** on CDN, or for hypothetical blocks?
2. Does it add a third path layout besides `{dir}/components/ui` and `{dir}/kit`?
3. Can blocks stay “shadcn plain” (one runtime per item) without new CLI flags?

If yes to 2 or vague on 1 → park it.

## Suggested versioning

| Change set | Version |
|------------|---------|
| A + tests + docs only | `2.0.2` (bugfix) |
| A + B (+ optional C warn) | `2.0.2` or `2.1.0` if paths behavior is considered feature |
| Breaking path/default changes | `2.1.0` / discuss `3.0.0` only if contract breaks |

## Related product decision (already agreed in chat)

- Primitives = only hard multi-runtime problem  
- Blocks / composites / widgets = normal shadcn contracts later  
- See [anti-overengineering.md](./anti-overengineering.md) and [decisions.md](./decisions.md)
