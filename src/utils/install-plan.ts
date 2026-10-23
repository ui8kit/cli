import path from "path"
import type { Component, ComponentFile, Config } from "../registry/schema.js"
import { SCHEMA_CONFIG } from "./schema-config.js"
import { assertSafeRegistryPath, normalizeDir, resolveFileInstallPath, toPosix } from "./paths.js"
import { filterFilesForRuntime } from "./runtime-files.js"
import { applyTransforms, shouldTransformFile } from "./transform.js"

export interface PlannedFile {
  /** Registry file entry. */
  file: ComponentFile
  /** Install path relative to the project root (posix separators). */
  rel: string
  /** Exact content written to disk (after import transforms / rules substitution). */
  content: string
}

/**
 * Substitute the two installer placeholders of a `registry:rules` item:
 *   `{kit}`   → primitives folder (item `meta.kitTarget`, default `ui`,
 *               resolved like a `registry:ui` target, so `dir` / `paths.ui` apply)
 *   `{globs}` → item `meta.globs` (relative to `dir`), prefixed with `dir`
 */
export function renderRulesContent(content: string, component: Component, config: Config): string {
  const dir = normalizeDir(config.dir || SCHEMA_CONFIG.defaultDir)
  const kitTarget = typeof component.meta?.kitTarget === "string" ? component.meta.kitTarget : "ui"
  // Resolve a file inside the kit folder (same mapping as installed primitives), then take its folder.
  const probe = `${kitTarget.replace(/\/+$/, "")}/x`
  const kit = path.posix.dirname(resolveFileInstallPath({ path: probe, target: probe, content: "" }, "registry:ui", config))
  const globList: string[] = Array.isArray(component.meta?.globs) ? component.meta!.globs : ["**/*"]
  const globs = globList.map((g) => path.posix.join(dir, g)).join(",")
  return content.replace(/\{kit\}/g, kit).replace(/\{globs\}/g, globs)
}

/**
 * Files an item installs, with their final paths and contents. Shared by `init`, `add`
 * and `check` so the lock hashes match what was written.
 *  - `registry:rules`: target relative to the app root, `{kit}` / `{globs}` substituted;
 *  - others: `--runtime` filter → `resolveFileInstallPath` → import transforms.
 * An item whose own `runtime` differs from `runtime` installs nothing.
 */
export function planItemFiles(component: Component, config: Config, runtime?: string): PlannedFile[] {
  if (component.type === "registry:rules") {
    return component.files.map((file) => {
      const rel = toPosix(file.target?.trim() || file.path)
      assertSafeRegistryPath(rel)
      return { file, rel, content: renderRulesContent(file.content || "", component, config) }
    })
  }
  if (runtime && component.runtime && component.runtime !== runtime) return []
  const files = filterFilesForRuntime(component.files, runtime, {
    componentType: component.type,
    itemRuntime: component.runtime,
  })
  return files.map((file) => {
    const rel = toPosix(resolveFileInstallPath(file, component.type, config))
    const content = shouldTransformFile(path.posix.basename(rel))
      ? applyTransforms(file.content || "", config.aliases, config.importStyle || "alias")
      : file.content || ""
    return { file, rel, content }
  })
}
