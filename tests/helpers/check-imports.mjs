import fs from "node:fs"
import path from "node:path"

/** Returns relative imports (./ ../) in an installed tree that resolve to no file. */
export function findUnresolvedImports(root) {
  const files = []
  ;(function walk(d) {
    for (const e of fs.readdirSync(d)) {
      const p = path.join(d, e)
      fs.statSync(p).isDirectory() ? walk(p) : files.push(p)
    }
  })(root)
  const bad = []
  for (const f of files.filter((f) => /\.(ts|tsx|svelte|vue)$/.test(f))) {
    const src = fs.readFileSync(f, "utf8")
    for (const m of src.matchAll(/(?:from|import)\s+["'](\.[^"']*)["']/g)) {
      const b = path.resolve(path.dirname(f), m[1])
      const ok = [b, ...[".ts", ".tsx", ".svelte", ".vue"].map((e) => b + e), path.join(b, "index.ts")].some(
        (c) => fs.existsSync(c) && fs.statSync(c).isFile(),
      )
      if (!ok) bad.push(`${path.relative(root, f)} -> ${m[1]}`)
    }
  }
  return { files: files.length, bad }
}
