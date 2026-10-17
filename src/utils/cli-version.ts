import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const CLI_PACKAGE_NAME = "ui8kit"

const moduleDir = dirname(fileURLToPath(import.meta.url))

function real(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

function readPackage(candidate: string): { name?: string; version?: string } | null {
  if (!existsSync(candidate)) return null
  try {
    return JSON.parse(readFileSync(candidate, "utf-8")) as { name?: string; version?: string }
  } catch {
    return null
  }
}

/**
 * Version of the ui8kit package that contains one of `starts` (files or directories).
 * Each start is resolved through symlinks first (`node_modules/.bin/ui8kit` -> `node_modules/ui8kit/dist/index.js`),
 * then searched upward; only a package.json named `ui8kit` counts, so the npx cache manifest or the
 * consumer's own package.json is never reported as the CLI version.
 */
export function resolveCliVersion(starts: Array<string | undefined>): string {
  for (const start of starts) {
    if (!start) continue
    const resolved = real(start)
    let current = isFile(resolved) ? dirname(resolved) : resolved
    for (let i = 0; i < 8; i += 1) {
      const pkg = readPackage(resolve(current, "package.json"))
      if (pkg?.name === CLI_PACKAGE_NAME && pkg.version) return pkg.version
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return "0.0.0"
}

/** The running CLI's version: the bundle's own directory first, then the (symlink-resolved) entry script. */
export function getCliVersion(): string {
  return resolveCliVersion([moduleDir, process.argv[1]])
}
