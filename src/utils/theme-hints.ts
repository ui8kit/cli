import path from "path"
import type { Component, Config } from "../registry/schema.js"
import { resolveFileInstallPath, toPosix } from "./paths.js"

export interface ThemeHint {
  /** Item name, e.g. `theme-claude`. */
  name: string
  /** Skin id set as `data-skin`, e.g. `claude`. */
  skin: string
  /** Installed CSS file (project-relative). */
  css: string
  /** Import specifier relative to the folder of `globalCss`. */
  importPath: string
}

/**
 * How to turn on each installed skin (`registry:theme` items with a skin CSS file): import the file after the
 * styles entry and set `data-skin` on `<html>`. The CLI never edits the app's entry files.
 */
export function collectThemeHints(components: Component[], config: Config): ThemeHint[] {
  const hints: ThemeHint[] = []
  const cssDir = path.posix.dirname(toPosix(config.globalCss || "src/index.css"))
  for (const c of components) {
    if (c.type !== "registry:theme") continue
    const skin = typeof (c.meta as any)?.skin?.id === "string" ? String((c.meta as any).skin.id) : ""
    if (!skin) continue
    const file = c.files.find((f) => (f.target ?? f.path).endsWith(".css"))
    if (!file) continue
    const css = resolveFileInstallPath(file, c.type, config)
    let rel = path.posix.relative(cssDir, css)
    if (!rel.startsWith(".")) rel = `./${rel}`
    hints.push({ name: c.name, skin, css, importPath: rel })
  }
  return hints
}

export function printThemeHints(hints: ThemeHint[], globalCss?: string): void {
  if (hints.length === 0) return
  console.log("\nSkins installed (tokens only, components unchanged). Turn one on:")
  for (const h of hints) {
    console.log(`  ${h.name}: import ${h.css} after ${globalCss || "the styles entry"} and set data-skin="${h.skin}" on <html>`)
  }
}
