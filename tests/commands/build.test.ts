import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { buildCommand } from "../../src/commands/build.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-build-test-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

describe("build command", () => {
  let fixture = ""
  const originalCwd = process.cwd()

  beforeEach(() => {
    fixture = tempDir()
    fs.ensureDirSync(fixture)
    process.chdir(fixture)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await fs.remove(fixture)
  })

  it("generates registry artifacts for each component", async () => {
    await fs.ensureDir(path.join(fixture, "src", "components", "ui"))

    const sourcePath = path.join(fixture, "src", "components", "ui", "button.tsx")
    const componentSource = "export const Button = () => null\n"
    await fs.writeFile(sourcePath, componentSource)

    const registryPath = path.join(fixture, "src", "registry.json")
    await fs.writeJson(registryPath, {
      $schema: "https://ui.buildy.tw/schema/registry.json",
      items: [
        {
          name: "button",
          type: "registry:ui",
          dependencies: [],
          devDependencies: [],
          files: [{ path: "src/components/ui/button.tsx" }]
        }
      ]
    })

    const outputDir = path.join(fixture, "packages", "registry", "r")
    const outputFile = path.join(outputDir, "components", "ui", "button.json")
    const indexFile = path.join(outputDir, "index.json")

    await buildCommand(registryPath, { output: outputDir, cwd: fixture })

    expect(await fs.pathExists(outputFile)).toBe(true)
    expect(await fs.pathExists(indexFile)).toBe(true)

    const payload = await fs.readJson(outputFile)
    expect(payload.name).toBe("button")
    expect(payload.type).toBe("registry:ui")
    expect(payload.files[0].content).toBe(componentSource)

    const index = await fs.readJson(indexFile)
    expect(index.components).toHaveLength(1)
    expect(index.components[0].name).toBe("button")
  })
})
