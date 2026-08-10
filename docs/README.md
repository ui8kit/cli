# ui8kit CLI documentation

Contract **2.0.0** · Node.js `>=20`

`ui8kit` is a **file-based registry CLI** (shadcn-style): it fetches registry items from a CDN (or local server) and **writes source files into your app**. It does not treat `node_modules` as the kit source of truth, so Tailwind and bundlers see real classes and files.

This docs set covers concepts, configuration, every command, the registry JSON contract, CDN/cache behavior, publishing, end-to-end scenarios, troubleshooting, and migration from v1.

## Guides

| Doc | Contents |
|-----|----------|
| [Getting started](./getting-started.md) | Install, first `init` / `add`, verification |
| [Concepts](./concepts.md) | Mental model, folders, types, runtimes, path remap |
| [Configuration](./configuration.md) | Full `ui8kit.config.json` reference |
| [Commands](./commands.md) | Every command, flag, and example |
| [Registry format](./registry-format.md) | Item / index JSON contract |
| [CDN and cache](./cdn-and-cache.md) | URL resolution, pinning, offline cache |
| [Publishing a registry](./publishing.md) | `scan` → `build` → host `/r` |
| [Troubleshooting](./troubleshooting.md) | Common failures and fixes |
| [Migration v1 → v2](./migration-v2.md) | Breaking changes checklist |

## Scenarios

| Scenario | Audience |
|----------|----------|
| [Consumer app (React)](./scenarios/consumer-react.md) | App teams installing primitives |
| [Svelte / Solid / Vue](./scenarios/multi-runtime.md) | Multi-runtime digests |
| [Go Templ / PHP](./scenarios/non-js.md) | Kit on disk without a JS framework |
| [Private / strict CDN](./scenarios/private-cdn.md) | Locked registry URL + version pin |
| [Maintain & publish registry](./scenarios/maintain-registry.md) | Authors assembling `packages/registry/r` |
| [CI dry-run & upgrades](./scenarios/ci-and-upgrades.md) | Automation, `diff`, force updates |

## Quick mental model

```text
                    ┌─────────────────────┐
                    │  Registry CDN `/r`  │
                    │  index.json + items │
                    └──────────┬──────────┘
                               │  fetch
                               ▼
┌──────────────┐    ui8kit add     ┌────────────────────────┐
│ App project  │ ◄──────────────── │ files under {dir}/…    │
│ ui8kit.config│                   │ components/ui, utils…  │
└──────────────┘                   └────────────────────────┘
```

Authors use the reverse path:

```text
source kit  →  ui8kit scan  →  registry.json  →  ui8kit build  →  packages/registry/r
```

## Related

- Package README: [../README.md](../README.md)
- Maintainer scripts: [../scripts/README.md](../scripts/README.md)
- Changelog: [../CHANGELOG.md](../CHANGELOG.md)
