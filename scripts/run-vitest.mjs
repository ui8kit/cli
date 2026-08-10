#!/usr/bin/env node
/**
 * Run Vitest with a normalized cwd.
 * On Windows, a lowercase drive letter (e:\) breaks Vitest suite context
 * (describe → Cannot read properties of undefined (reading 'config')).
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cwd =
  process.platform === "win32"
    ? root.replace(/^([a-zA-Z]):/, (_, drive) => `${drive.toUpperCase()}:`)
    : root

const vitestEntry = path.join(cwd, "node_modules", "vitest", "vitest.mjs")
if (!fs.existsSync(vitestEntry)) {
  console.error(`Vitest not found at ${vitestEntry}. Run npm install.`)
  process.exit(1)
}

const args = process.argv.slice(2)
const result = spawnSync(process.execPath, [vitestEntry, ...args], {
  cwd,
  stdio: "inherit",
  env: process.env,
})

process.exit(result.status === null ? 1 : result.status)
