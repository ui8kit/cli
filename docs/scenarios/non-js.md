# Scenario: Go Templ / PHP (non-JS apps)

Use the CLI to drop kit files onto disk for Tailwind content scanning, Templ/Latte/Twig includes, or shared CSS — even when the app is not a Node SPA.

## Goals

- `framework: templ` (or `latte` / `twig` / `none`)
- Install under `internal/` (or `templates/`)
- Skip JS core stubs when the registry has no JS utils

## Go Templ

```bash
cd my-go-site
npx ui8kit init --yes \
  --framework templ \
  --runtime templ \
  --dir internal \
  --skip-core \
  --registry-url https://cdn.example.com/ui8kit/r \
  --strict-cdn
```

```bash
npx ui8kit add button card \
  --runtime templ \
  --registry-url https://cdn.example.com/ui8kit/r \
  --strict-cdn
```

Layout example:

```text
internal/
  components/ui/button/...
  blocks/...
  layouts/...
ui8kit.config.json
```

Point Tailwind (whatever builds your CSS) at `internal/**`.

## Latte / Twig

```bash
npx ui8kit init --yes --framework latte --dir templates --skip-core \
  --registry-url https://cdn.example.com/ui8kit/r --strict-cdn

npx ui8kit add hero --runtime latte \
  --registry-url https://cdn.example.com/ui8kit/r --strict-cdn
```

## Config snapshot

```json
{
  "contractVersion": "2.0.0",
  "framework": "templ",
  "runtime": "templ",
  "typescript": false,
  "dir": "internal",
  "registryUrl": "https://cdn.example.com/ui8kit/r",
  "strictCdn": true,
  "importStyle": "alias"
}
```

## Pitfalls

- Without `--skip-core`, init may warn if the CDN has no lib/utils for that runtime — harmless if you only need UI/blocks.
- npm dependency installs from items still need a `package.json` in cwd when items declare JS deps; pure markup items often declare none.
- Keep `strictCdn` on so CI never silently pulls a public React digest.
