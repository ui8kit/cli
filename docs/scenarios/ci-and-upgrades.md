# Scenario: CI dry-run and upgrades

Automate registry hygiene without surprising file writes.

## Goals

- Fail CI when local kit drifts from pinned registry (optional policy)
- Preview installs in PRs
- Controlled upgrades with `--force`

## Dry-run install (PR check)

```bash
npx ui8kit add button card \
  --dry-run \
  --registry-url "$REGISTRY_URL" \
  --registry-version "$REGISTRY_VERSION" \
  --strict-cdn \
  --no-cache
```

Exit code is non-zero only on hard failures (network/schema), not because dry-run skipped writes.

## Diff gate (optional)

```bash
npx ui8kit diff --json \
  --registry-url "$REGISTRY_URL" \
  --registry-version "$REGISTRY_VERSION" \
  --strict-cdn \
  --no-cache > diff-report.json
```

Policy examples:

- **Warn only**: upload `diff-report.json` as artifact
- **Fail on drift**: parse JSON in a small script and `exit 1` if any component reports changes

## Scheduled upgrade job

```bash
npx ui8kit cache clear
npx ui8kit add --all --force \
  --runtime "$RUNTIME" \
  --registry-url "$REGISTRY_URL" \
  --registry-version "$REGISTRY_VERSION" \
  --strict-cdn
git add -A && git commit -m "chore(ui): sync kit from registry $REGISTRY_VERSION"
```

Prefer opening a PR over committing on `main`.

## GitHub Actions skeleton

```yaml
name: ui8kit
on:
  pull_request:
  workflow_dispatch:
jobs:
  kit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx ui8kit@latest info --cdn
      - run: |
          npx ui8kit@latest add button --dry-run \
            --registry-url "${{ vars.UI8KIT_REGISTRY_URL }}" \
            --registry-version "${{ vars.UI8KIT_REGISTRY_VERSION }}" \
            --strict-cdn --no-cache
```

## Local developer loop

```bash
ui8kit diff button
ui8kit add button --dry-run
ui8kit add button --force   # accept
ui8kit info --json          # share in bug reports
```

## Pitfalls

- CI without `--strict-cdn` may pass against public CDNs while prod uses private ones.
- Cached JSON can hide freshly published digests — use `--no-cache` on release verification.
