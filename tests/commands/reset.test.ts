import { mkdirSync, writeFileSync } from "node:fs"
import {
  ensureDir,
  pathExists,
  readJson,
  writeJson,
  remove,
  readFile,
  writeFile,
} from "../../src/utils/fs.js"
import path from "path"
import os from "os"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { resetCommand } from "../../src/commands/reset.js"
import * as cache from "../../src/utils/cache.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-reset-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

describe("reset command", () => {
  let fixture = ""
  const originalCwd = process.cwd()
  const originalEnv = process.env

  beforeEach(() => {
    fixture = tempDir()
    mkdirSync(fixture, { recursive: true })
    process.chdir(fixture)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await remove(fixture)
    process.env = originalEnv
  })

  it("supports dry-run mode without removing files", async () => {
    const configPath = path.join(fixture, "ui8kit.config.json")
    const registryFile = path.join(fixture, "src", "registry.json")
    const componentsDir = path.join(fixture, "src", "components")
    const outputMap = path.join(fixture, "packages", "registry", "ui8kit.map.json")
    await ensureDir(path.dirname(registryFile))
    await ensureDir(componentsDir)
    await ensureDir(path.dirname(outputMap))
    await writeFile(configPath, "{}")
    await writeFile(registryFile, "{}")
    await writeFile(path.join(componentsDir, "button.tsx"), "export const Button = () => null\n")
    await writeFile(outputMap, "{}")

    await resetCommand({ dryRun: true, yes: true })

    expect(await pathExists(configPath)).toBe(true)
    expect(await pathExists(registryFile)).toBe(true)
    expect(await pathExists(componentsDir)).toBe(true)
  })

  it("removes UI8Kit artifacts with --yes", async () => {
    const registryDir = path.join(fixture, "packages", "registry")
    const outputMap = path.join(registryDir, "ui8kit.map.json")
    const registrySchema = path.join(registryDir, "schema", "registry.json")
    const registryIndex = path.join(registryDir, "r", "index.json")
    const componentDir = path.join(fixture, "src", "components", "ui")
    const libDir = path.join(fixture, "src", "lib")
    const configPath = path.join(fixture, "ui8kit.config.json")

    await ensureDir(path.dirname(registrySchema))
    await ensureDir(path.dirname(registryIndex))
    await ensureDir(componentDir)
    await ensureDir(libDir)
    await writeFile(registrySchema, "{}")
    await writeFile(registryIndex, "{}")
    await writeFile(outputMap, "{}")
    await writeFile(path.join(componentDir, "button.tsx"), "export const Button = () => null\n")
    await writeFile(path.join(libDir, "util.ts"), "export const util = 1\n")
    await writeFile(configPath, "{}")

    await resetCommand({ yes: true })

    expect(await pathExists(outputMap)).toBe(false)
    expect(await pathExists(registrySchema)).toBe(false)
    expect(await pathExists(configPath)).toBe(false)
    expect(await pathExists(registryIndex)).toBe(false)
    expect(await pathExists(componentDir)).toBe(false)
    expect(await pathExists(libDir)).toBe(false)
  })

  it("clears local cache when --with-cache is enabled", async () => {
    const clearSpy = vi.spyOn(cache, "clearCache").mockResolvedValue(undefined)
    const configPath = path.join(fixture, "ui8kit.config.json")
    await writeFile(configPath, "{}")

    await resetCommand({ yes: true, withCache: true })

    expect(clearSpy).toHaveBeenCalled()
    expect(await pathExists(configPath)).toBe(false)
  })
})

