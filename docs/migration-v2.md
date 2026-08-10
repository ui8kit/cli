# Migration: v1 → v2

Contract **2.0.0** is a breaking change for config and install paths. There are no production users assumed on v1; treat this as a clean cut.

## Breaking changes

| Area | v1 | v2 |
|------|----|----|
| Framework | `vite-react` required for init | `react` \| `svelte` \| … \| `none` |
| Init requirements | Vite + React project | Any folder; optional `package.json` |
| Install root | Implicit `src/…` mix | Explicit `dir` + canonical folders |
| File paths | Basename flatten | Preserve `target` / nested `path` |
| Types | Limited set | Adds `registry:utils`, `registry:widget` |
| Utility map | `ui8kit.map.json` from `utility-props*.ts` | **Removed** |
| JSON Schema emit on build | Yes | **Removed** |
| Runtime deps | Heavy (chalk, ora, typescript, …) | `commander`, `prompts`, `zod` |
| Node engines | 18+ | **20+** |

## Config migration

**Before**

```json
{
  "framework": "vite-react",
  "componentsDir": "./src/components",
  "libDir": "./src/lib"
}
```

**After**

```json
{
  "contractVersion": "2.0.0",
  "framework": "react",
  "runtime": "react",
  "dir": "src",
  "typescript": true,
  "globalCss": "src/index.css"
}
```

Soft-migration: reading `framework: "vite-react"` rewrites to `"react"` at load time, but you should commit the new shape.

## Install path migration

If v1 flattened `Button.tsx` into a single folder, v2 may create nested directories from registry `target`s. Plan a one-time:

```bash
ui8kit reset --yes          # or manually remove old kit folders
ui8kit init --yes --framework react --dir src
ui8kit add --all --force
```

Update app imports to the new layout / aliases.

## Author pipeline migration

1. Delete reliance on `ui8kit.map.json` generation (move safelist generation to codegen if needed)
2. Stop expecting `packages/registry/schema/**` from `build`
3. Keep using `scan` → `build` for `/r` artifacts
4. `registry clean` still removes leftover map/schema paths if present

## CDN flags

v1 CDN overrides still work; prefer config fields:

```json
{
  "registryUrl": "https://cdn.example.com/r",
  "registryVersion": "0.1.0",
  "strictCdn": true,
  "cdnBaseUrls": ["https://cdn.example.com/r"]
}
```

## Checklist

- [ ] Node `>=20` in local + CI
- [ ] Replace `vite-react` with `react` (or other)
- [ ] Set `dir` / `paths` / `runtime`
- [ ] Re-install kit with `add --force`
- [ ] Fix Tailwind content paths
- [ ] Fix app import paths
- [ ] Authors: rebuild registry without map/schema assumptions
- [ ] Document new `--registry-url` for consumers
