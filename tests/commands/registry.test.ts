import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { getRegistryCleanTargets, getDefaultRegistryOutputDir, registryCleanCommand } from "../../src/commands/registry.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-registry-clean-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

describe("registry clean", () => {
  let fixture = ""
  const originalCwd = process.cwd()

  beforeEach(() => {
    fixture = tempDir()
    fs.ensureDirSync(fixture)
    process.chdir(fixture)
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await fs.remove(fixture)
  })

  it("resolves default registry artifact targets", () => {
    const output = getDefaultRegistryOutputDir(fixture)
    expect(output).toBe(path.resolve(fixture, "packages", "registry", "r"))
    const targets = getRegistryCleanTargets(fixture)
    expect(targets).toContain(output)
    expect(targets.some(p => p.includes("schema"))).toBe(true)
  })

  it("reports paths only and does not remove files in dry-run", async () => {
    const artifactFile = path.join(fixture, "packages", "registry", "r", "components", "ui", "button.json")
    await fs.ensureDir(path.dirname(artifactFile))
    await fs.writeFile(artifactFile, "content")

    const successSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
    await registryCleanCommand({ dryRun: true, force: true })

    expect(await fs.pathExists(artifactFile)).toBe(true)
    expect(successSpy).toHaveBeenCalled()
  })

  it("removes generated registry artifacts with --all flag", async () => {
    const output = path.join(fixture, "packages", "registry", "r")
    const schemaFile = path.join(fixture, "packages", "registry", "schema", "registry.json")
    const registryFile = path.join(fixture, "src", "registry.json")
    const mapFile = path.join(fixture, "packages", "registry", "ui8kit.map.json")
    await fs.ensureDir(path.dirname(schemaFile))
    await fs.ensureDir(path.dirname(mapFile))
    await fs.ensureDir(path.join(fixture, "src"))
    await fs.ensureDir(path.join(output, "components"))
    await fs.writeFile(path.join(output, "components", "button.json"), "{}")
    await fs.writeFile(schemaFile, "{}")
    await fs.writeFile(mapFile, "{}")
    await fs.writeJson(registryFile, { items: [] })

    await registryCleanCommand({ all: true, force: true })

    expect(await fs.pathExists(output)).toBe(false)
    expect(await fs.pathExists(schemaFile)).toBe(false)
    expect(await fs.pathExists(mapFile)).toBe(false)
    expect(await fs.pathExists(registryFile)).toBe(false)
  })
})
