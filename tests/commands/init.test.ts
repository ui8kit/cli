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
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { buildInitConfig, initCommand } from "../../src/commands/init.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-init-test-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

describe("init config generation", () => {
  it("creates default config with contract fields", () => {
    const config = buildInitConfig({ yes: true, registry: "ui" })
    expect(config.typescript).toBe(true)
    expect(config.framework).toBe("none")
    expect(config.dir).toBe("src")
    expect(config.contractVersion).toBe("2.0.0")
    expect(config.importStyle).toBe("alias")
  })

  it("applies framework and dir", () => {
    const config = buildInitConfig({
      yes: true,
      registry: "ui",
      framework: "templ",
      dir: "internal",
    })
    expect(config.framework).toBe("templ")
    expect(config.runtime).toBe("templ")
    expect(config.dir).toBe("internal")
    expect(config.aliases["@/ui"]).toContain("internal")
  })
})

describe("init without vite/react", () => {
  let fixture = ""
  const originalCwd = process.cwd()

  beforeEach(async () => {
    fixture = tempDir()
    await ensureDir(fixture)
    process.chdir(fixture)
    await writeJson(path.join(fixture, "package.json"), {
      name: "test-project",
      version: "1.0.0",
      private: true,
    })
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await remove(fixture)
  })

  it("initializes kit folders for templ/internal", async () => {
    await initCommand({
      yes: true,
      framework: "templ",
      dir: "internal",
      skipCore: true,
    })

    expect(await pathExists(path.join(fixture, "ui8kit.config.json"))).toBe(true)
    const config = await readJson(path.join(fixture, "ui8kit.config.json"))
    expect(config.framework).toBe("templ")
    expect(config.dir).toBe("internal")
    expect(await pathExists(path.join(fixture, "internal/components/ui"))).toBe(true)
    expect(await pathExists(path.join(fixture, "internal/utils"))).toBe(true)
    expect(await pathExists(path.join(fixture, "internal/lib"))).toBe(true)
  })
})
