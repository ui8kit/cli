import path from "path"
import type { Runtime } from "./schema-config.js"

/** Component types that always install every file (no runtime slice). */
const ALWAYS_FULL_TYPES = new Set([
  "registry:utils",
  "registry:lib",
  "registry:variants",
])

type FileLike = {
  path?: string
  target?: string
}

function fileKey(file: FileLike): string {
  return (file.target || file.path || "").replace(/\\/g, "/")
}

/** Shared brick assets kept for every runtime install. */
export function isSharedRuntimeFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase()
  return (
    base.endsWith(".shared.ts") ||
    base.endsWith(".variants.json") ||
    base === "variants.json"
  )
}

/**
 * Whether a file belongs to a specific runtime slice
 * (codegen naming: button.tsx, button.solid.tsx, Button.svelte, …).
 */
export function matchesRuntimeFile(filePath: string, runtime: string): boolean {
  const base = path.basename(filePath)

  switch (runtime) {
    case "react":
      return /\.tsx$/i.test(base) && !/\.solid\.tsx$/i.test(base)
    case "solid":
      return /\.solid\.tsx$/i.test(base)
    case "svelte":
      return /\.svelte$/i.test(base)
    case "vue":
      return /\.vue$/i.test(base)
    case "templ":
      return (
        /\.templ$/i.test(base) ||
        /_templ\.go$/i.test(base) ||
        /_gen\.go$/i.test(base)
      )
    case "latte":
      return /\.latte$/i.test(base)
    case "twig":
      return /\.html\.twig$/i.test(base) || /\.twig$/i.test(base)
    default:
      return true
  }
}

/**
 * Filter registry item files for `--runtime` / config.runtime.
 * Shared assets (`*.shared.ts`, `*.variants.json`) are always kept.
 * Utils/lib/variants items are never sliced.
 */
export function filterFilesForRuntime<T extends FileLike>(
  files: readonly T[],
  runtime: string | undefined,
  options?: { componentType?: string },
): T[] {
  if (!runtime) {
    return [...files]
  }

  if (options?.componentType && ALWAYS_FULL_TYPES.has(options.componentType)) {
    return [...files]
  }

  return files.filter((file) => {
    const key = fileKey(file)
    if (!key) return false
    if (isSharedRuntimeFile(key)) return true
    return matchesRuntimeFile(key, runtime)
  })
}

export function isKnownRuntime(value: string): value is Runtime {
  return (
    value === "react" ||
    value === "svelte" ||
    value === "vue" ||
    value === "solid" ||
    value === "templ" ||
    value === "latte" ||
    value === "twig"
  )
}
