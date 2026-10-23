import { mkdirSync } from "node:fs"
import {
  remove,
  writeJson,
} from "../../src/utils/fs.js"
import path from "path"
import os from "os"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { addCommand } from "../../src/commands/add.js"
import * as registryApi from "../../src/registry/api.js"
import * as fsUtils from "../../src/utils/fs.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-add-cdn-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

describe("add command CDN option wiring", () => {
  let fixture = ""
  const originalCwd = process.cwd()

  beforeEach(async () => {
    fixture = tempDir()
    mkdirSync(fixture, { recursive: true })
    process.chdir(fixture)

    mkdirSync(path.join(fixture, "src", "components", "ui"), { recursive: true })
    await writeJson(path.join(fixture, "package.json"), { name: "test", version: "1.0.0" })
    await writeJson(path.join(fixture, "ui8kit.config.json"), {
      framework: "vite-react",
      typescript: true,
      globalCss: "src/index.css",
      aliases: {
        "@": "./src",
        "@/components": "./src/components"
      },
      registry: "@ui8kit",
      componentsDir: "./src/components",
      libDir: "./src/lib"
    })
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await remove(fixture)
  })

  it("passes explicit CDN options to getComponent", async () => {
    const component = {
      name: "button",
      type: "registry:ui",
      dependencies: [],
      devDependencies: [],
      files: [
        { path: "components/ui/button.tsx", content: "export const Button = () => null\n" }
      ]
    }

    vi.spyOn(registryApi, "getComponent").mockResolvedValue(component as any)

    await addCommand(["button"], {
      registryUrl: "https://cdn.example.com/@ui8kit/registry@latest/r",
      registryVersion: "1.5.1",
      strictCdn: true
    })

    expect(registryApi.getComponent).toHaveBeenCalledWith("button", "ui", {
      // name fetches are never catalog-filtered (utils and lib/* resolve via registryDependencies)
      excludeTypes: [],
      maxRetries: 1,
      noCache: false,
      cdn: {
        registryUrl: "https://cdn.example.com/@ui8kit/registry@latest/r",
        registryVersion: "1.5.1",
        strictCdn: true
      }
    })
  })

  it("does not scaffold empty base directories when adding --all", async () => {
    const component = {
      name: "button",
      type: "registry:ui",
      dependencies: [],
      devDependencies: [],
      files: [
        { path: "components/ui/button.tsx", content: "export const Button = () => null\n" }
      ]
    }

    vi.spyOn(registryApi, "getAllComponents").mockResolvedValue([component as any])
    vi.spyOn(registryApi, "getComponent").mockResolvedValue(component as any)
    const ensureDirSpy = vi.spyOn(fsUtils, "ensureDir").mockResolvedValue(undefined as never)

    await addCommand(["all"], {
      all: true,
      registry: "ui"
    })

    const createdDirs = ensureDirSpy.mock.calls.map(([dir]) => path.resolve(String(dir)))
    // only the folders of files actually written
    expect(createdDirs).toContain(path.resolve(fixture, "src/components/ui"))
    expect(createdDirs).not.toContain(path.resolve(fixture, "src/lib"))
    expect(createdDirs).not.toContain(path.resolve(fixture, "src/blocks"))
    expect(createdDirs).not.toContain(path.resolve(fixture, "src/layouts"))
    expect(createdDirs).not.toContain(path.resolve(fixture, "src/variants"))
  })

  it("does not create base directories in dry-run mode", async () => {
    const component = {
      name: "button",
      type: "registry:ui",
      dependencies: [],
      devDependencies: [],
      files: [
        { path: "components/ui/button.tsx", content: "export const Button = () => null\n" }
      ]
    }

    vi.spyOn(registryApi, "getAllComponents").mockResolvedValue([component as any])
    vi.spyOn(registryApi, "getComponent").mockResolvedValue(component as any)
    const ensureDirSpy = vi.spyOn(fsUtils, "ensureDir").mockResolvedValue(undefined as never)

    await addCommand(["all"], {
      all: true,
      dryRun: true,
      registry: "ui"
    })

    expect(ensureDirSpy).not.toHaveBeenCalled()
  })
})
