# Anti-overengineering — primitives wall

## Problem statement

ui8kit is **more complex than shadcn** only for **primitives** (multi-runtime codegen). Everything after that (blocks, composites, widgets, layouts) should feel like normal shadcn: one item, clear files, deps, paths.

If we “generalize” runtime filters, import rewriters, and path engines for every type, we overengineer the CLI and still ship broken utils/deps.

## The wall

```text
HARD ZONE (primitives)
  codegen · pack · registry:ui · registry:utils
  --runtime file filter
  shared.ts / variants.json
  relative ../../utils contract

SOFT ZONE (the rest — later)
  registry:component | composite | block | layout | widget
  one runtime per item (or separate CDN prefix)
  shadcn-plain add/list/diff
  no extension heuristics
```

## Rules of thumb

1. **Publish complexity upstream when possible.** Prefer single-runtime block JSON over teaching `add` new file rules.
2. **One remap, not a framework.** At most rewrite `components/ui` → `kit`. Do not build a general VFS.
3. **Do not rewrite relative imports** unless brainstorm proves kit+utils-under-kit is mandatory.
4. **Hide from list ≠ block from fetch.** Catalog UX must not break dependency installs.
5. **No new command surface** for primitives hotfix (no `ui8kit add-primitive`). Fix `add`.
6. **E2E beats architecture slides.** One CDN→svelte→build test > three new config fields.

## Comparison note (for brainstorm)

| | shadcn CLI | ui8kit today | ui8kit target |
|--|------------|--------------|---------------|
| Stacks | React-centric | Multi-runtime primitives | Same, wall preserved |
| Utils | Always via init/deps | Broken on `add` deps | Fixed like shadcn |
| Paths | Work | Broken with `target` | Minimal ui→kit |
| Blocks | Plain | N/A yet | Plain shadcn |

shadcn would win a React-only smoke. It would **not** solve Svelte+Templ multi-file bricks — that stays our hard zone.
