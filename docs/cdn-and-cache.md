# CDN and cache

## Registry base URL

A **base** is a URL that already points at the `/r` tree (no trailing slash required):

```text
https://cdn.example.com/ui8kit/r
https://unpkg.com/@ui8kit/registry@latest/r
http://127.0.0.1:4173/r
```

From that base the CLI requests:

```text
{base}/index.json
{base}/components/ui/button.json
{base}/utils/cn.json
…
```

## Resolution order

`getCdnUrls` builds an ordered unique list:

1. Explicit `--registry-url` / `config.registryUrl` (after version rewrite)
2. If **not** (`strictCdn` **and** explicit URL): append  
   - `config.cdnBaseUrls` when set, else  
   - built-in defaults:

```text
https://unpkg.com/@ui8kit/registry@latest/r
https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r
https://raw.githubusercontent.com/ui8kit/core/refs/heads/main/packages/registry/r
```

### Strict mode

```bash
ui8kit add button --registry-url https://cdn.example.com/r --strict-cdn
```

Only that URL is tried. Failures do **not** fall back to public CDNs. Prefer this for private registries and CI.

### Version pinning

`--registry-version 0.1.0` / `registryVersion` rewrites `@latest` in URL templates:

```text
…/@ui8kit/registry@latest/r  →  …/@ui8kit/registry@0.1.0/r
```

Custom hosts without `@latest` are left unchanged; pin by changing the path yourself or hosting immutable digests.

## Inspect resolution

```bash
ui8kit info --cdn
ui8kit info --json
```

Maintainer probe (repo scripts, not shipped in tarball logic):

```bash
npm run get-cdn
node scripts/get-cdn.js --url https://cdn.example.com/r --path index.json --json
```

## Local cache

Successful JSON responses are cached under:

```text
~/.ui8kit/cache/
```

- Default TTL: **1 hour**
- Bypass: `ui8kit --no-cache …` or clear with `ui8kit cache clear`
- `reset --with-cache` also clears the cache

Cache keys are derived from request paths; safe to delete anytime.

## Offline / air-gapped

1. Host `packages/registry/r` on an internal static server  
2. Set `registryUrl` + `strictCdn: true`  
3. Optionally pre-warm: run `list` / `add` once on a builder image and ship the cache (usually unnecessary if the internal CDN is fast)

## Retry

`ui8kit add … --retry` increases fetch retries for flaky CDNs. Prefer fixing CDN reliability for production CI.
