import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { buildCommand } from "../../src/commands/build.js"
import * as cache from "../../src/utils/cache.js"
import * as registryApi from "../../src/registry/api.js"

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

  it("preserves both components/index and variants/index entries by type", async () => {
    const componentsPath = path.join(fixture, "src", "components")
    const variantsPath = path.join(fixture, "src", "variants")
    await fs.ensureDir(path.join(componentsPath, "ui"))
    await fs.ensureDir(variantsPath)

    const componentsIndexSource = "export const ComponentsIndex = () => null\n"
    const variantsIndexSource = "export * from \"./button\"\n"
    const buttonSource = "export const Button = () => null\n"

    await fs.writeFile(path.join(componentsPath, "index.ts"), componentsIndexSource)
    await fs.writeFile(path.join(componentsPath, "ui", "layout.tsx"), componentsIndexSource)
    await fs.writeFile(path.join(variantsPath, "index.ts"), variantsIndexSource)
    await fs.writeFile(path.join(variantsPath, "button.ts"), buttonSource)

    const registryPath = path.join(fixture, "src", "registry.json")
    await fs.writeJson(registryPath, {
      $schema: "https://ui.buildy.tw/schema/registry.json",
      items: [
        {
          name: "index",
          type: "registry:composite",
          dependencies: [],
          devDependencies: [],
          files: [{ path: "src/components/index.ts" }]
        },
        {
          name: "index",
          type: "registry:variants",
          dependencies: [],
          devDependencies: [],
          files: [{ path: "src/variants/index.ts" }]
        }
      ]
    })

    const outputDir = path.join(fixture, "packages", "registry", "r")
    const compositeOutput = path.join(outputDir, "components", "index.json")
    const variantsOutput = path.join(outputDir, "components", "variants", "index.json")
    const indexFile = path.join(outputDir, "index.json")

    await buildCommand(registryPath, { output: outputDir, cwd: fixture })

    expect(await fs.pathExists(compositeOutput)).toBe(true)
    expect(await fs.pathExists(variantsOutput)).toBe(true)

    const compositePayload = await fs.readJson(compositeOutput)
    const variantsPayload = await fs.readJson(variantsOutput)
    expect(compositePayload.type).toBe("registry:composite")
    expect(variantsPayload.type).toBe("registry:variants")

    const index = await fs.readJson(indexFile)
    const hasComposite = index.components.some((item: any) => item.name === "index" && item.type === "registry:composite")
    const hasVariants = index.components.some((item: any) => item.name === "index" && item.type === "registry:variants")
    expect(hasComposite).toBe(true)
    expect(hasVariants).toBe(true)
  })

  it("resets cache before build", async () => {
    const clearSpy = vi.spyOn(cache, "clearCache").mockResolvedValue(undefined)
    const resetSpy = vi.spyOn(registryApi, "resetCache").mockImplementation(() => {})

    const sourcePath = path.join(fixture, "src", "components", "ui", "button.tsx")
    const componentSource = "export const Button = () => null\n"
    await fs.ensureDir(path.dirname(sourcePath))
    await fs.writeFile(sourcePath, componentSource)

    const registryPath = path.join(fixture, "src", "registry.json")
    await fs.writeJson(registryPath, {
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

    await buildCommand(registryPath, { output: path.join(fixture, "packages", "registry", "r"), cwd: fixture })

    expect(clearSpy).toHaveBeenCalledTimes(1)
    expect(resetSpy).toHaveBeenCalledTimes(1)
  })
})
