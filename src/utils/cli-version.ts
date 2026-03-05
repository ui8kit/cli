import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

function findPackageJsonPath(): string | null {
  const roots = [process.argv[1], __dirname]

  for (const rawRoot of roots) {
    if (!rawRoot) {
      continue
    }

    let current = rawRoot.endsWith(".js") ? dirname(rawRoot) : rawRoot
    for (let i = 0; i < 8; i += 1) {
      const candidate = resolve(current, "package.json")
      if (existsSync(candidate)) {
        return candidate
      }

      const parent = dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }
  }

  return null
}

export function getCliVersion(): string {
  const packageJsonPath = findPackageJsonPath()
  if (!packageJsonPath) {
    return "0.0.0"
  }

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version?: string }
    return pkg.version ?? "0.0.0"
  } catch {
    return "0.0.0"
  }
}
