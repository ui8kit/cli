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

  if (file.target && file.target.trim()) {
    let target = toPosix(file.target).replace(/^\.\//, "").replace(/^\/+/, "")
    // Absolute-from-cwd style targets that already include dir
    if (target === dir || target.startsWith(dir + "/")) {
      return target
    }
    // Legacy: target starts with src/
    if (target.startsWith("src/")) {
      target = target.slice(4)
      if (dir === "src") return toPosix(path.posix.join("src", target))
      return toPosix(path.posix.join(dir, target))
    }
    return toPosix(path.posix.join(dir, target))
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
