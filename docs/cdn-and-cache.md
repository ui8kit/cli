# CDN and cache

## Registry base URL

A **base** is a URL that already points at the `/r` tree (no trailing slash required):

```text
https://cdn.example.com/ui8kit/r
https://unpkg.com/@ui8kit/registry@3/r/react
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
https://unpkg.com/@ui8kit/registry@<v>/r[/<runtime>]
https://cdn.jsdelivr.net/npm/@ui8kit/registry@<v>/r[/<runtime>]
```

`<v>` = `registryVersion` when set, otherwise the CLI's own major (ui8kit 3.x → `3`).
Both CDNs resolve npm major ranges (`@3` → newest 3.x.y; jsDelivr: "Use a version range
instead of an exact version: `/npm/jquery@3/…`", unpkg redirects `@3` to the exact version).
`/<runtime>` is appended for registry `>= 3` (per-runtime digests).

### Strict mode

```bash
ui8kit add button --registry-url https://cdn.example.com/r --strict-cdn
```

Only that URL is tried. Failures do **not** fall back to public CDNs. Prefer this for private registries and CI.

### Version pinning

Default (no `registryVersion`): same major range as the CLI, **not** an exact pin.
Pin with `--registry-version 3.0.0` / `registryVersion`; canary with `--registry-version canary`.
The `@latest` placeholder in URL templates is rewritten:

```text
…/@ui8kit/registry@latest/r  →  …/@ui8kit/registry@3/r/react      (default, CLI 3.x)
…/@ui8kit/registry@latest/r  →  …/@ui8kit/registry@3.0.0/r/react  (--registry-version 3.0.0)
```

With an explicit `--registry-version`, a custom `--registry-url` that has an npm-style `name@<version>` segment (tag, range or exact) gets that segment replaced. Custom hosts without such a segment are left unchanged and the CLI warns that `--registry-version` is ignored; pin by changing the path yourself or hosting immutable digests.

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

Cache keys are scoped by the resolved registry bases (URL, version/range, runtime folder) and the runtime, so different registries, versions and runtimes never share entries. Safe to delete anytime.

## Offline / air-gapped

1. Host `packages/registry/r` on an internal static server  
2. Set `registryUrl` + `strictCdn: true`  
3. Optionally pre-warm: run `list` / `add` once on a builder image and ship the cache (usually unnecessary if the internal CDN is fast)

## Retry

`ui8kit add … --retry` increases fetch retries for flaky CDNs. Prefer fixing CDN reliability for production CI.
