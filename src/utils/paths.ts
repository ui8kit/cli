import path from "path"
import {
  CANONICAL_PATHS,
  TYPE_TO_FOLDER,
  TYPE_TO_PATH_KEY,
  type ComponentType,
  type PathKey,
} from "./schema-config.js"
import type { ComponentFile, Config } from "../registry/schema.js"

export function toPosix(value: string): string {
  return value.replace(/\\/g, "/")
}

export function normalizeDir(dir: string): string {
  return toPosix(dir).replace(/^\.\//, "").replace(/\/+$/, "")
}

/** Physical folder for a path key, respecting config.paths remap. */
export function resolveCanonicalFolder(key: PathKey, config: Config): string {
  const remap = config.paths?.[key]
  if (remap && remap.trim()) {
    return normalizeDir(remap)
  }
  return CANONICAL_PATHS[key]
}

export function resolveTypeFolder(componentType: string, config: Config): string {
  const typed = componentType as ComponentType
  const key = TYPE_TO_PATH_KEY[typed]
  if (key) return resolveCanonicalFolder(key, config)
  return TYPE_TO_FOLDER[typed] || CANONICAL_PATHS.components
}

/** Known target prefixes → path key, longest first. */
const TARGET_PREFIX_KEYS: ReadonlyArray<readonly [string, PathKey]> = [
  ["components/ui", "ui"],
  ["components", "components"],
  ["blocks", "blocks"],
  ["layouts", "layouts"],
  ["variants", "variants"],
  ["widgets", "widgets"],
  ["utils", "utils"],
  ["lib", "lib"],
]

function configuredPath(key: PathKey, config: Config): string | undefined {
  const value = config.paths?.[key]
  return value && value.trim() ? normalizeDir(value) : undefined
}

/**
 * Remap a registry `target` (relative to `dir`) through `config.paths`.
 *
 *  1. If the target starts with a canonical folder (`components/ui`, `components`,
 *     `blocks`, `layouts`, `variants`, `widgets`, `utils`, `lib`) and `paths` remaps
 *     that key, the prefix is replaced by the configured folder.
 *  2. Otherwise (registry-specific first folder such as `primitives/` or `presets/`)
 *     the first folder is treated as the item type's own folder and replaced by
 *     `paths[<key of the item type>]`, when configured.
 *  3. With no matching `paths` entry the target is returned unchanged.
 */
export function mapTargetByPaths(target: string, componentType: string, config: Config): string {
  if (!config.paths) return target

  for (const [prefix, key] of TARGET_PREFIX_KEYS) {
    if (target === prefix || target.startsWith(prefix + "/")) {
      const mapped = configuredPath(key, config)
      return mapped ? joinTarget(mapped, target.slice(prefix.length)) : target
    }
  }

  const typeKey = TYPE_TO_PATH_KEY[componentType as ComponentType]
  const mapped = typeKey ? configuredPath(typeKey, config) : undefined
  if (!mapped) return target
  const slash = target.indexOf("/")
  return slash === -1 ? joinTarget(mapped, "/" + target) : joinTarget(mapped, target.slice(slash))
}

function joinTarget(folder: string, rest: string): string {
  const tail = rest.replace(/^\/+/, "")
  return tail ? toPosix(path.posix.join(folder, tail)) : folder
}

/**
 * Merge `--path key=dir` CLI flags over `config.paths` (flags win).
 * Throws on a malformed pair or unknown key.
 */
export function applyPathOverrides(config: Config, flags?: readonly string[]): Config {
  if (!flags || flags.length === 0) return config
  const validKeys = Object.keys(CANONICAL_PATHS)
  const overrides: Record<string, string> = {}
  for (const flag of flags) {
    const eq = flag.indexOf("=")
    const key = eq === -1 ? "" : flag.slice(0, eq).trim()
    const dir = eq === -1 ? "" : flag.slice(eq + 1).trim()
    if (!key || !dir) {
      throw new Error(`Invalid --path "${flag}". Expected key=dir, e.g. --path ui=kit`)
    }
    if (!validKeys.includes(key)) {
      throw new Error(`Unknown --path key "${key}". Valid keys: ${validKeys.join(", ")}`)
    }
    overrides[key] = dir
  }
  return { ...config, paths: { ...config.paths, ...overrides } }
}

/**
 * All install roots that `init` should ensure exist.
 */
export function listInstallRoots(config: Config): string[] {
  const dir = normalizeDir(config.dir || "src")
  const keys = Object.keys(CANONICAL_PATHS) as PathKey[]
  return keys.map((key) => toPosix(path.posix.join(dir, resolveCanonicalFolder(key, config))))
}

/**
 * Strip known prefixes so we preserve brick-relative structure.
 */
function stripKnownPrefixes(rel: string, typeFolder: string): string {
  let out = rel
  const prefixes = [
    typeFolder,
    "components/ui",
    "components/lib",
    "components/utils",
    "components",
    "src",
    "ui",
    "lib",
    "utils",
    "blocks",
    "layouts",
    "variants",
    "widgets",
  ]
  for (const prefix of prefixes) {
    if (out === prefix) return ""
    if (out.startsWith(prefix + "/")) {
      out = out.slice(prefix.length + 1)
      // keep stripping outer wrappers only once for typeFolder-like
      break
    }
  }
  return out
}

/**
 * Reject registry file paths that could escape the install root: absolute
 * paths (POSIX, Windows drive or UNC) and any `..` segment.
 */
export function assertSafeRegistryPath(value: string): void {
  const p = toPosix(value)
  if (/^\//.test(p) || /^[A-Za-z]:/.test(p) || p.split("/").includes("..")) {
    throw new Error(`Unsafe install path "${value}": registry targets must be relative and must not contain ".."`)
  }
}

/** Throw unless `relative` resolves inside `root` (the project cwd). */
export function assertInsideRoot(root: string, relative: string): string {
  const abs = path.resolve(root, relative)
  const rel = path.relative(path.resolve(root), abs)
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside the project: ${relative}`)
  }
  return abs
}

/**
 * Resolve final cwd-relative path for a registry file.
 * Always preserves nested paths (no basename flatten).
 */
export function resolveFileInstallPath(
  file: ComponentFile,
  componentType: string,
  config: Config,
): string {
  const dir = normalizeDir(config.dir || "src")
  const typeFolder = resolveTypeFolder(componentType, config)

  assertSafeRegistryPath(file.target && file.target.trim() ? file.target : file.path)
  if (file.target && file.target.trim()) {
    const original = toPosix(file.target).replace(/^\.\//, "").replace(/^\/+/, "")
    // Target relative to `dir` (strip a leading `dir/`, or legacy `src/`)
    let rel = original
    let legacy: string
    if (original === dir || original.startsWith(dir + "/")) {
      rel = original === dir ? "" : original.slice(dir.length + 1)
      legacy = original
    } else if (original.startsWith("src/")) {
      rel = original.slice(4)
      legacy = dir === "src" ? toPosix(path.posix.join("src", rel)) : toPosix(path.posix.join(dir, rel))
    } else {
      legacy = toPosix(path.posix.join(dir, original))
    }
    // Precedence: CLI --path (merged into config.paths) > config.paths by target prefix > file target
    const mapped = rel ? mapTargetByPaths(rel, componentType, config) : rel
    return mapped === rel ? legacy : toPosix(path.posix.join(dir, mapped))
  }

  const raw = toPosix(file.path).replace(/^\.\//, "").replace(/^\/+/, "")
  const rel = stripKnownPrefixes(raw, typeFolder)
  if (!rel) {
    return toPosix(path.posix.join(dir, typeFolder, path.posix.basename(raw)))
  }
  return toPosix(path.posix.join(dir, typeFolder, rel))
}

/** @deprecated name — use resolveFileInstallPath directory portion */
export function resolveInstallDir(target: string, config: Config): string {
  const dir = normalizeDir(config.dir || "src")
  const normalizedTarget = toPosix(target).replace(/^\/?src\//i, "").replace(/^\.\//, "")

  // Legacy: componentsDir/libDir when present
  if (normalizedTarget === "lib" && config.libDir) {
    return normalizeDir(config.libDir)
  }
  if (normalizedTarget === "ui" && config.componentsDir) {
    return toPosix(path.posix.join(normalizeDir(config.componentsDir), "ui"))
  }
  if (normalizedTarget === "components" && config.componentsDir) {
    return normalizeDir(config.componentsDir)
  }

  const keyMap: Record<string, PathKey> = {
    lib: "lib",
    utils: "utils",
    ui: "ui",
    components: "components",
    blocks: "blocks",
    layouts: "layouts",
    variants: "variants",
    widgets: "widgets",
  }

  if (normalizedTarget.includes("/")) {
    return toPosix(path.posix.join(dir, normalizedTarget))
  }

  const key = keyMap[normalizedTarget]
  if (key) {
    return toPosix(path.posix.join(dir, resolveCanonicalFolder(key, config)))
  }

  return toPosix(path.posix.join(dir, CANONICAL_PATHS.components))
}

export function inferTargetFromType(componentType: string): string {
  return TYPE_TO_FOLDER[componentType as ComponentType] || CANONICAL_PATHS.components
}

export function defaultAliasesForDir(dir: string): Record<string, string> {
  const d = normalizeDir(dir)
  const prefix = d === "src" ? "@" : `@/${d.replace(/^web\//, "web/")}`
  // Keep simple @/ aliases pointing at dir
  return {
    "@": `./${d}`,
    "@/lib": `./${d}/lib`,
    "@/utils": `./${d}/utils`,
    "@/components": `./${d}/components`,
    "@/ui": `./${d}/components/ui`,
    "@/blocks": `./${d}/blocks`,
    "@/layouts": `./${d}/layouts`,
    "@/variants": `./${d}/variants`,
    "@/widgets": `./${d}/widgets`,
    ...(prefix !== "@" ? {} : {}),
  }
}
