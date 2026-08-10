# Scenario: Maintain and publish a registry

Author workflow for a kit monorepo that ships `packages/registry/r`.

## Goals

- Generate `src/registry.json` from source
- Build CDN artifacts
- Smoke-test against a local static server
- Publish immutable digests

## Layout (example)

```text
ui8kit-core/
  src/
    components/ui/button.tsx
    components/...
    blocks/...
    lib/...
    variants/...
  packages/registry/r/   # build output
  package.json
```

## Commands

```bash
cd ui8kit-core

# 1) Manifest
npx ui8kit scan --source src --output src/registry.json

# 2) Artifacts
npx ui8kit build src/registry.json --output packages/registry/r

# 3) Local server (serve parent so path is /r/...)
npx --yes serve packages/registry -l 4173
# or: python -m http.server 4173 --directory packages/registry
```

## Consumer smoke (second terminal)

```bash
mkdir -p /tmp/ui8kit-smoke && cd /tmp/ui8kit-smoke
npm init -y
npx ui8kit init --yes --framework none --dir src --skip-core \
  --registry-url http://127.0.0.1:4173/r --strict-cdn
npx ui8kit list --registry-url http://127.0.0.1:4173/r --strict-cdn
npx ui8kit add button --registry-url http://127.0.0.1:4173/r --strict-cdn
```

## Release checklist

1. [ ] `scan` + review `registryDependencies`
2. [ ] `build` + spot-check item JSON has `content`
3. [ ] Local smoke `list` / `add`
4. [ ] Publish `packages/registry/r` to CDN / npm
5. [ ] Tag digest (`0.3.0`) and announce base URL
6. [ ] Update consumer docs with `--registry-version`

## Cleanup

```bash
npx ui8kit registry clean --force
# rebuild from scratch after clean
```

## CI sketch

```yaml
# .github/workflows/registry.yml
- run: npx ui8kit scan --source src --output src/registry.json
- run: npx ui8kit build src/registry.json --output packages/registry/r
- run: test -f packages/registry/r/index.json
# upload packages/registry/r as release asset or npm pack
```

See also [Publishing](../publishing.md).
