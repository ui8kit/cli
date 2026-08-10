import path from "node:path"
import { readdir, stat } from "./fs.js"

const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"]

export interface WalkOptions {
  recursive?: boolean
  extensions?: string[]
  ignoreNames?: string[]
}

/** Collect files under root matching extensions (no external glob dep). */
export async function walkFiles(root: string, options: WalkOptions = {}): Promise<string[]> {
  const recursive = options.recursive ?? true
  const extensions = (options.extensions ?? DEFAULT_EXTENSIONS).map((ext) => ext.toLowerCase())
  const ignoreNames = new Set(options.ignoreNames ?? [])
  const results: string[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (ignoreNames.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (recursive || depth === 0) {
          if (recursive) await walk(full, depth + 1)
        }
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!extensions.includes(ext)) continue
      results.push(full)
    }
  }

  try {
    const info = await stat(root)
    if (!info.isDirectory()) return results
  } catch {
    return results
  }

  await walk(root, 0)
  return results
}

/** Only files directly in dir (non-recursive). */
export async function listFilesFlat(root: string, options: Omit<WalkOptions, "recursive"> = {}): Promise<string[]> {
  return walkFiles(root, { ...options, recursive: false })
}
