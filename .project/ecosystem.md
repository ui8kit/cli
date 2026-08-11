# Ecosystem — repos, paths, CDN

## Local workspace (Windows maintainer)

| Path | Package / role |
|------|----------------|
| `e:\_@Bun\@ui8kit-cli\` | CLI source → npm `ui8kit` |
| `e:\_@Bun\@ui8kit-registry\` | Digest source → npm `@ui8kit/registry` |
| `e:\_@Bun\@ui8kit-codegen\` | Primitive SoT (`generated/ui`, `generated/utils`) |
| `e:\_@Bun\@TestApp\` | Consumer smoke (Vite/Svelte/Bun) |
| `e:\_@Bun\MentorYChat\` | Product app with hand/kit layout inspiration (`web/src/kit`) |

GitHub (intended / published):

| Repo | Notes |
|------|-------|
| `https://github.com/ui8kit/cli` | CLI |
| `https://github.com/ui8kit/registry` | Registry digest |
| `https://github.com/ui8kit/codegen` | Codegen (pack script default `--repo ui8kit/codegen`) |

## Registry layout (committed / published)

```text
@ui8kit-registry/
  r/
    index.json                 # stamped version=package.json version
    components/ui/<name>.json  # registry:ui — ALL runtimes embedded per brick
    utils/utils.json           # registry:utils
  schema/                      # JSON Schema copies
  scripts/
    pack-from-codegen.mjs      # codegen → src/ + registry.json
    write-schema.mjs
    stamp-index.mjs
    verify-registry.mjs
  src/                         # gitignored staged kit
  .cache/codegen/              # gitignored GitHub clones
```

Example brick on disk after pack+build: multi-file content inside one JSON (`Button.svelte`, `button.tsx`, `button.solid.tsx`, `button.templ`, … + shared + variants).

Brick naming (codegen) that runtime filter matches:

```text
generated/ui/button/
  button.tsx
  button.solid.tsx
  Button.svelte
  Button.vue
  button.templ / button_templ.go / button_gen.go
  Button.latte
  Button.html.twig
  button.shared.ts
  button.variants.json
```

**Special case:** `slot` is React-only (`slot.tsx`). `--runtime svelte` → skip (no matching files).

## CDN consumer commands (canonical)

```bash
npx ui8kit@2.0.1 init --yes --framework svelte --runtime svelte --dir src \
  --registry-url https://unpkg.com/@ui8kit/registry@2.0.0/r \
  --strict-cdn

npx ui8kit@2.0.1 add button --runtime svelte \
  --registry-url https://unpkg.com/@ui8kit/registry@2.0.0/r \
  --strict-cdn
```

Until CLI hotfix: also fetch utils manually or run init **without** `--skip-core` (and still verify `src/utils` exists after `add`, because deps path is broken).

## TestApp smoke layout (after workarounds)

```text
@TestApp/
  src/kit/<brick>/     # moved from components/ui (paths.ui not honored by CLI)
  src/utils/*.ts       # manually installed from r/utils/utils.json
  src/App.svelte       # Title/Text/Stack/Button/Inline greeting
  ui8kit.config.json
```

## Related docs outside `.project`

- CLI user docs: `docs/` (English), `README.md`, `CHANGELOG.md`
- Registry README: rebuild via GitHub / sibling codegen
- Cursor notes (historical planning): may exist under `e:\_@Go\@CLI\cursor_ui8kit_cli_fastygo_registry.md` — prefer this `.project` as SoT for CLI refactor intent
