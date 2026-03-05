import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { infoCommand } from "../../src/commands/info.js"
import { SCHEMA_CONFIG } from "../../src/utils/schema-config.js"
import * as packageManager from "../../src/utils/package-manager.js"
import * as fetchModule from "node-fetch"

vi.mock("../../src/utils/package-manager.js", () => ({
  detectPackageManager: vi.fn()
}))

vi.mock("node-fetch", () => ({
  default: vi.fn()
}))

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-info-test-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

describe("info command", () => {
  let fixture = ""
  const originalCwd = process.cwd()
  const output: string[] = []
  let logSpy: any

  beforeEach(async () => {
    fixture = tempDir()
    await fs.ensureDir(fixture)
    process.chdir(fixture)
    output.length = 0
    logSpy = vi.spyOn(console, "log")
    logSpy.mockImplementation((line) => {
      output.push(String(line))
    })
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await fs.remove(fixture)
  })

  it("prints diagnostics with local config", async () => {
    await fs.writeJson(path.join(fixture, "ui8kit.config.json"), {
      framework: "vite-react",
      typescript: true,
      globalCss: "styles.css",
      aliases: {},
      registry: "@ui8kit",
      componentsDir: "./src/components",
      libDir: "./src/lib"
    })

    vi.mocked(packageManager.detectPackageManager).mockResolvedValue("bun")
    vi.mocked(fetchModule.default).mockResolvedValue({ status: 200 } as any)

    await infoCommand()
    const logs = output.join("\n")

    expect(logs).toContain("PM      bun")
    expect(logs).toContain("Config  ./ui8kit.config.json (found)")
    expect(logs).toContain("  framework    vite-react")
    expect(logs).toContain("  globalCss    styles.css")
    expect(logs).toContain(`CDN       ${SCHEMA_CONFIG.cdnBaseUrls[0]} (ok)`)
  })

  it("prints cache stats when config is missing", async () => {
    vi.mocked(packageManager.detectPackageManager).mockResolvedValue("npm")
    vi.mocked(fetchModule.default).mockResolvedValue({ status: 500 } as any)

    await infoCommand()
    const logs = output.join("\n")

    expect(logs).toContain("Config  not found")
    expect(logs).toContain("PM      npm")
    expect(logs).toContain(`CDN       ${SCHEMA_CONFIG.cdnBaseUrls[0]} (failed)`)
  })
})
