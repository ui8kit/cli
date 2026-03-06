import fs from "fs-extra"
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
    fs.ensureDirSync(fixture)
    process.chdir(fixture)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await fs.remove(fixture)
    process.env = originalEnv
  })

  it("supports dry-run mode without removing files", async () => {
    const configPath = path.join(fixture, "ui8kit.config.json")
    const registryFile = path.join(fixture, "src", "registry.json")
    const componentsDir = path.join(fixture, "src", "components")
    const outputMap = path.join(fixture, "packages", "registry", "ui8kit.map.json")
    await fs.ensureDir(path.dirname(registryFile))
    await fs.ensureDir(componentsDir)
    await fs.ensureDir(path.dirname(outputMap))
    await fs.writeFile(configPath, "{}")
    await fs.writeFile(registryFile, "{}")
    await fs.writeFile(path.join(componentsDir, "button.tsx"), "export const Button = () => null\n")
    await fs.writeFile(outputMap, "{}")

    await resetCommand({ dryRun: true, yes: true })

    expect(await fs.pathExists(configPath)).toBe(true)
    expect(await fs.pathExists(registryFile)).toBe(true)
    expect(await fs.pathExists(componentsDir)).toBe(true)
  })

  it("removes UI8Kit artifacts with --yes", async () => {
    const registryDir = path.join(fixture, "packages", "registry")
    const outputMap = path.join(registryDir, "ui8kit.map.json")
    const registrySchema = path.join(registryDir, "schema", "registry.json")
    const registryIndex = path.join(registryDir, "r", "index.json")
    const componentDir = path.join(fixture, "src", "components", "ui")
    const libDir = path.join(fixture, "src", "lib")
    const configPath = path.join(fixture, "ui8kit.config.json")

    await fs.ensureDir(path.dirname(registrySchema))
    await fs.ensureDir(path.dirname(registryIndex))
    await fs.ensureDir(componentDir)
    await fs.ensureDir(libDir)
    await fs.writeFile(registrySchema, "{}")
    await fs.writeFile(registryIndex, "{}")
    await fs.writeFile(outputMap, "{}")
    await fs.writeFile(path.join(componentDir, "button.tsx"), "export const Button = () => null\n")
    await fs.writeFile(path.join(libDir, "util.ts"), "export const util = 1\n")
    await fs.writeFile(configPath, "{}")

    await resetCommand({ yes: true })

    expect(await fs.pathExists(outputMap)).toBe(false)
    expect(await fs.pathExists(registrySchema)).toBe(false)
    expect(await fs.pathExists(configPath)).toBe(false)
    expect(await fs.pathExists(registryIndex)).toBe(false)
    expect(await fs.pathExists(componentDir)).toBe(false)
    expect(await fs.pathExists(libDir)).toBe(false)
  })

  it("clears local cache when --with-cache is enabled", async () => {
    const clearSpy = vi.spyOn(cache, "clearCache").mockResolvedValue(undefined)
    const configPath = path.join(fixture, "ui8kit.config.json")
    await fs.writeFile(configPath, "{}")

    await resetCommand({ yes: true, withCache: true })

    expect(clearSpy).toHaveBeenCalled()
    expect(await fs.pathExists(configPath)).toBe(false)
  })
})

