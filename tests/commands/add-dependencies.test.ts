import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { addCommand } from "../../src/commands/add.js"
import * as registryApi from "../../src/registry/api.js"
import * as packageManager from "../../src/utils/package-manager.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-add-deps-test-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

function component(name: string, type: string, registryDependencies: string[] = [], dependencies: string[] = []) {
  return {
    name,
    type,
    dependencies,
    devDependencies: [],
    registryDependencies,
    files: [
      {
        path: `components/ui/${name}.tsx`,
        content: `import React from "react"\nexport const ${name} = () => null\n`
      }
    ]
  }
}

describe("add command nested dependencies", () => {
  let fixture = ""
  const originalCwd = process.cwd()

  beforeEach(async () => {
    fixture = tempDir()
    await fs.ensureDir(fixture)
    process.chdir(fixture)

    await fs.writeJson(path.join(fixture, "package.json"), {
      name: "test-project",
      version: "1.0.0",
      dependencies: { react: "18.3.1" }
    })
    await fs.writeJson(path.join(fixture, "ui8kit.config.json"), {
      framework: "vite-react",
      typescript: true,
      globalCss: "src/index.css",
      aliases: {
        "@": "./src",
        "@/components": "./src/components",
        "@/components/ui": "./src/components/ui",
        "@ui8kit/core": "node_modules/@ui8kit/core"
      },
      registry: "@ui8kit",
      componentsDir: "./src/components",
      libDir: "./src/lib"
    })
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await fs.remove(fixture)
  })

  it("installs dependency components before dependents", async () => {
    const components = {
      layout: component("layout", "registry:ui", ["sidebar"]),
      sidebar: component("sidebar", "registry:ui", ["button"]),
      button: component("button", "registry:ui", [], ["react"])
    }

    vi.spyOn(registryApi, "getComponent").mockImplementation(async (name: string, _registryType) => {
      return components[name.toLowerCase()] ?? null
    })
    vi.spyOn(packageManager, "installDependencies").mockResolvedValue(undefined as never)

    const writeSpy = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined as never)

    await addCommand(["layout"], {
      registry: "ui"
    })

    expect(writeSpy).toHaveBeenCalledTimes(3)
    const writtenFiles = writeSpy.mock.calls.map(call => path.basename(call[0] as string))
    expect(writtenFiles).toEqual(["button.tsx", "sidebar.tsx", "layout.tsx"])
  })
})
