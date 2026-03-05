import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { findConfig } from "../../src/utils/project.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-project-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`)
}

describe("project utilities", () => {
  const originalCwd = process.cwd()
  let fixture = ""

  beforeEach(() => {
    fixture = tempDir()
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await fs.remove(fixture)
  })

  it("finds config at project root", async () => {
    await fs.ensureDir(fixture)
    const config = {
      framework: "vite-react",
      typescript: true,
      globalCss: "src/index.css",
      aliases: {},
      registry: "@ui8kit",
      componentsDir: "./src/components",
      libDir: "./src/lib"
    }
    await fs.writeJson(path.join(fixture, "ui8kit.config.json"), config)
    process.chdir(fixture)

    const found = await findConfig("ui")
    expect(found).not.toBeNull()
    expect(found?.registry).toBe("@ui8kit")
  })

  it("falls back to ./src/ for compatibility", async () => {
    await fs.ensureDir(path.join(fixture, "src"))
    const config = {
      framework: "vite-react",
      typescript: true,
      globalCss: "src/index.css",
      aliases: {},
      registry: "@ui8kit",
      componentsDir: "./src/components",
      libDir: "./src/lib"
    }
    await fs.writeJson(path.join(fixture, "src", "ui8kit.config.json"), config)
    process.chdir(fixture)

    const found = await findConfig("ui")
    expect(found?.componentsDir).toBe("./src/components")
  })

  it("returns null when config does not exist", async () => {
    await fs.ensureDir(fixture)
    process.chdir(fixture)

    const found = await findConfig("ui")
    expect(found).toBeNull()
  })
})
