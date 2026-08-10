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
    mkdirSync(fixture, { recursive: true })
    process.chdir(fixture)
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await remove(fixture)
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
    await ensureDir(path.dirname(artifactFile))
    await writeFile(artifactFile, "content")

    const successSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
    await registryCleanCommand({ dryRun: true, force: true })

    expect(await pathExists(artifactFile)).toBe(true)
    expect(successSpy).toHaveBeenCalled()
  })

  it("removes generated registry artifacts with --all flag", async () => {
    const output = path.join(fixture, "packages", "registry", "r")
    const schemaFile = path.join(fixture, "packages", "registry", "schema", "registry.json")
    const registryFile = path.join(fixture, "src", "registry.json")
    const mapFile = path.join(fixture, "packages", "registry", "ui8kit.map.json")
    await ensureDir(path.dirname(schemaFile))
    await ensureDir(path.dirname(mapFile))
    await ensureDir(path.join(fixture, "src"))
    await ensureDir(path.join(output, "components"))
    await writeFile(path.join(output, "components", "button.json"), "{}")
    await writeFile(schemaFile, "{}")
    await writeFile(mapFile, "{}")
    await writeJson(registryFile, { items: [] })

    await registryCleanCommand({ all: true, force: true })

    expect(await pathExists(output)).toBe(false)
    expect(await pathExists(schemaFile)).toBe(false)
    expect(await pathExists(mapFile)).toBe(false)
    expect(await pathExists(registryFile)).toBe(false)
  })
})
