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

  it("outputs JSON when requested", async () => {
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

    output.length = 0
    await infoCommand({ json: true })

    const payload = JSON.parse(output[0])
    expect(payload.version).toBeTruthy()
    expect(payload.configFound).toBe(true)
    expect(payload.node).toBeTruthy()
    expect(payload.packageManager).toBe("bun")
    expect(payload.config.framework).toBe("vite-react")
  })

  it("prints CDN resolution details when --cdn flag is set", async () => {
    await fs.writeJson(path.join(fixture, "ui8kit.config.json"), {
      framework: "vite-react",
      typescript: true,
      globalCss: "styles.css",
      aliases: {},
      registry: "@ui8kit",
      componentsDir: "./src/components",
      libDir: "./src/lib",
      registryUrl: "https://cdn.example.com/registry/@ui8kit/r",
      registryVersion: "1.5.1",
      strictCdn: true
    })

    vi.mocked(packageManager.detectPackageManager).mockResolvedValue("bun")
    vi.mocked(fetchModule.default).mockResolvedValue({ status: 200 } as any)

    output.length = 0
    await infoCommand({ cdn: true })

    const logs = output.join("\n")
    expect(logs).toContain("CDN Resolution")
    expect(logs).toContain("registryUrl override: https://cdn.example.com/registry/@ui8kit/r")
    expect(logs).toContain("registryVersion: 1.5.1")
    expect(logs).toContain("strictCdn: enabled")
  })
})
