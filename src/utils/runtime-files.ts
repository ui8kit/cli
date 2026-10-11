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

/** `*.types.ts`, `*.types.tsx`, `*.d.ts`: pure type files, never tied to one runtime. */
export function isTypeFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase()
  return /\.types\.(ts|tsx|mts|cts)$/.test(base) || /\.d\.(ts|mts|cts)$/.test(base)
}

const IMPORT_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".svelte",
  ".vue",
  ".json",
  ".solid.tsx",
]

export interface ImportRef {
  /** Raw module specifier, e.g. `./button.types` */
  specifier: string
  /** True when the statement only imports types (`import type`, `export type … from`, all `{ type X }`). */
  typeOnly: boolean
}

/**
 * Relative module specifiers (`./x`, `../x`) found in source text.
 * Regex based on purpose (no parser dependency): good enough for registry
 * sources (ts/tsx/svelte/vue script blocks).
 */
export function extractRelativeImports(source: string): ImportRef[] {
  const refs: ImportRef[] = []
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

  const statement = /\b(import|export)\s+(type\s+)?([^"';]*?)\bfrom\s*["'](\.{1,2}\/[^"']*|\.{1,2})["']/g
  for (const m of stripped.matchAll(statement)) {
    const keyword = m[1]
    const typeKeyword = Boolean(m[2])
    const clause = m[3] ?? ""
    let typeOnly = typeKeyword
    if (!typeOnly && keyword === "import") {
      const named = clause.match(/^\s*\{([^}]*)\}\s*$/)
      if (named) {
        const specs = named[1]!.split(",").map((x) => x.trim()).filter(Boolean)
        typeOnly = specs.length > 0 && specs.every((x) => /^type\s+/.test(x))
      }
    }
    refs.push({ specifier: m[4]!, typeOnly })
  }

  const sideEffect = /\bimport\s*["'](\.{1,2}\/[^"']*)["']/g
  for (const m of stripped.matchAll(sideEffect)) {
    refs.push({ specifier: m[1]!, typeOnly: false })
  }

  const dynamic = /\bimport\s*\(\s*["'](\.{1,2}\/[^"']*)["']\s*\)/g
  for (const m of stripped.matchAll(dynamic)) {
    refs.push({ specifier: m[1]!, typeOnly: false })
  }
  return refs
}

/**
 * Resolve a relative specifier from `fromKey` to one of `known` file keys
 * (posix, same root). Returns the matching key or undefined.
 */
export function resolveImportKey(
  fromKey: string,
  specifier: string,
  known: ReadonlySet<string>,
): string | undefined {
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(fromKey), specifier))
  // TS-style `./x.js` may point at `./x.ts`
  const base = /\.(m?js|jsx)$/.test(joined) && !known.has(joined) ? joined.replace(/\.(m?js|jsx)$/, "") : joined
  for (const ext of IMPORT_EXTENSIONS) {
    if (known.has(base + ext)) return base + ext
  }
  for (const ext of IMPORT_EXTENSIONS.slice(1)) {
    if (known.has(`${base}/index${ext}`)) return `${base}/index${ext}`
  }
  return undefined
}

/**
 * Filter registry item files for `--runtime` / config.runtime.
 *
 * Kept: files matching the runtime, shared assets (`*.shared.ts`,
 * `*.variants.json`), type files (`*.types.ts`, `*.d.ts`), and — transitively —
 * every file of the same item that a kept file imports with a relative
 * specifier. A file imported by a selected file is never dropped.
 * Utils/lib/variants items are never sliced.
 */
export function filterFilesForRuntime<T extends FileLike & { content?: string }>(
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

  const byKey = new Map<string, T>()
  for (const file of files) {
    const key = fileKey(file)
    if (key) byKey.set(key, file)
  }
  const known = new Set(byKey.keys())

  const kept = new Set<string>()
  const queue: string[] = []
  for (const key of byKey.keys()) {
    if (isSharedRuntimeFile(key) || isTypeFile(key) || matchesRuntimeFile(key, runtime)) {
      kept.add(key)
      queue.push(key)
    }
  }

  while (queue.length > 0) {
    const key = queue.pop()!
    const content = byKey.get(key)?.content
    if (!content) continue
    for (const ref of extractRelativeImports(content)) {
      const resolved = resolveImportKey(key, ref.specifier, known)
      if (resolved && !kept.has(resolved)) {
        kept.add(resolved)
        queue.push(resolved)
      }
    }
  }

  return files.filter((file) => kept.has(fileKey(file)))
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
