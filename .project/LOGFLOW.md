# Workflow / smoke log (pointer)

Consumer smoke against live CDN was performed **2026-08-11** on `@TestApp`.

Summary:

```text
bunx ui8kit@2.0.1 init … --framework svelte --runtime svelte --dir src --skip-core \
  --registry-url https://unpkg.com/@ui8kit/registry@2.0.0/r --strict-cdn

bunx ui8kit@2.0.1 add --all --runtime svelte --force …   # 32 UI bricks; utils NOT installed
# manual: fetch r/utils/utils.json → src/utils
# manual: move src/components/ui → src/kit
bun run build   # OK
bun run dev     # http://localhost:5173
```

Full narrative: [journal.md](./journal.md) · defects: [known-issues.md](./known-issues.md) · ecosystem paths: [ecosystem.md](./ecosystem.md).

Registry author build log (typical):

```text
cd @ui8kit-registry
npm run build
# pack:codegen (sibling or GitHub) → ui8kit@2.0.1 build → schema → stamp → verify
# digest=2.0.0 components=34 (utils + 33 ui)
```
