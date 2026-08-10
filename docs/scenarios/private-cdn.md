# Scenario: Private / strict CDN

Lock installs to an internal registry. No public fallback.

## Goals

- Single trusted base URL
- Version pin for reproducible builds
- CI-safe flags

## Consumer setup

```bash
npx ui8kit init --yes --framework react --dir src --skip-core \
  --registry-url https://registry.internal.example/ui8kit/r \
  --registry-version 1.4.2 \
  --strict-cdn
```

Commit `ui8kit.config.json`:

```json
{
  "contractVersion": "2.0.0",
  "framework": "react",
  "runtime": "react",
  "dir": "src",
  "registryUrl": "https://registry.internal.example/ui8kit/r",
  "registryVersion": "1.4.2",
  "strictCdn": true
}
```

Daily installs:

```bash
npx ui8kit add button --strict-cdn
# registryUrl / version already in config
```

One-off override (hotfix digest):

```bash
npx ui8kit add button \
  --registry-url https://registry.internal.example/ui8kit/r \
  --registry-version 1.4.3 \
  --strict-cdn \
  --force
```

## Verify CDN order

```bash
npx ui8kit info --cdn
```

Expect a single resolved URL when `strictCdn` is enabled with an explicit registry URL.

## Auth notes

The CLI uses plain HTTP(S) `fetch`. If your CDN needs auth:

- Use a VPN / mesh that injects access at the network layer, or
- Put a signed URL / gateway in front that does not require custom headers in the CLI

Header-based auth is not a built-in feature of this CLI.

## Pitfalls

- Forgetting `--strict-cdn` while debugging can hide misconfigured internal URLs by succeeding against public CDNs.
- Pin `registryVersion` in CI; floating `@latest` breaks reproducibility.
