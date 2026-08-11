# Journal

## 2026-08-11 — CDN live; CLI refactor deferred

### Shipped

- CLI **v2.0.0**: multi-runtime contract (`framework`/`runtime`/`dir`/`paths`/`cdnBaseUrls`), slim deps, path-preserving install, types including `registry:utils` / `registry:widget`, Node ≥20.
- CLI **v2.0.1**: runtime **file** filter (`src/utils/runtime-files.ts`) for multi-file bricks; docs updated; published to npm.
- Registry **`@ui8kit/registry@2.0.0`**: packed from codegen (33 bricks + utils), built with `npx ui8kit@2.0.1 build`, verified, CDN via unpkg/jsdelivr.
- Pack script: sibling codegen **or** GitHub fetch (`--repo` / `--ref` / `--force-github`).
- TestApp smoke: Vite + Svelte + Bun greeting using kit primitives.

### Learned the hard way (TestApp)

1. `ADD_EXCLUDED_COMPONENT_TYPES` prevents installing utils via `add` and via deps.
2. `paths.ui = kit` does nothing while targets are `components/ui/...`.
3. Must keep utils at `{dir}/utils` for relative imports after moving UI to `kit/`.
4. `slot` has no Svelte sources.
5. Contract “2.0.0 stable” was overstated for consumer DX — unit green ≠ CDN e2e.

### Product alignment (chat)

- Agree: only primitives need hard multi-runtime mechanics.
- Blocks/composites/widgets later = typical shadcn contracts.
- Avoid overengineering path/import engines for hypothetical future types.
- **Pause CLI refactor** until brainstorm; document everything in `.project`.

### Next

- Brainstorm using `refactor-backlog.md` + `known-issues.md`.
- Likely hotfix 2.0.2: utils fetch/deps + optional ui→kit prefix remap + e2e.
- Do not expand scan/widgets/transform scope in that hotfix.
