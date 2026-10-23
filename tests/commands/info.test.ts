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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { infoCommand } from "../../src/commands/info.js"
import { SCHEMA_CONFIG, getCdnUrls } from "../../src/utils/schema-config.js"
import * as packageManager from "../../src/utils/package-manager.js"

vi.mock("../../src/utils/package-manager.js", () => ({
  detectPackageManager: vi.fn(),
}))

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-info-test-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

describe("info command", () => {
  let fixture = ""
  const originalCwd = process.cwd()
  const output: string[] = []
  let logSpy: ReturnType<typeof vi.spyOn>
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    fixture = tempDir()
    await ensureDir(fixture)
    process.chdir(fixture)
    output.length = 0
    logSpy = vi.spyOn(console, "log")
    logSpy.mockImplementation((line) => {
      output.push(String(line))
    })
    fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await remove(fixture)
  })

  it("prints diagnostics with local config", async () => {
    await writeJson(path.join(fixture, "ui8kit.config.json"), {
      framework: "react",
      typescript: true,
      globalCss: "styles.css",
      aliases: {},
      registry: "@ui8kit",
      dir: "src",
    })

    vi.mocked(packageManager.detectPackageManager).mockResolvedValue("bun")
    fetchSpy.mockResolvedValue({ status: 200 } as Response)

    await infoCommand()
    const logs = output.join("\n")

    expect(logs).toContain("PM      bun")
    expect(logs).toContain("Config  ./ui8kit.config.json (found)")
    expect(logs).toContain("  framework    react")
    expect(logs).toContain("  globalCss    styles.css")
    expect(logs).toContain(`CDN       ${getCdnUrls("ui")[0]} (ok)`)
  })

  it("prints cache stats when config is missing", async () => {
    vi.mocked(packageManager.detectPackageManager).mockResolvedValue("npm")
    fetchSpy.mockResolvedValue({ status: 500 } as Response)

    await infoCommand()
    const logs = output.join("\n")

    expect(logs).toContain("Config  not found")
    expect(logs).toContain("PM      npm")
    expect(logs).toContain(`CDN       ${getCdnUrls("ui")[0]} (failed)`)
  })

  it("outputs JSON when requested", async () => {
    await writeJson(path.join(fixture, "ui8kit.config.json"), {
      framework: "react",
      typescript: true,
      globalCss: "styles.css",
      aliases: {},
      registry: "@ui8kit",
      dir: "src",
    })

    vi.mocked(packageManager.detectPackageManager).mockResolvedValue("bun")
    fetchSpy.mockResolvedValue({ status: 200 } as Response)

    output.length = 0
    await infoCommand({ json: true })

    const payload = JSON.parse(output[0])
    expect(payload.version).toBeTruthy()
    expect(payload.configFound).toBe(true)
    expect(payload.node).toBeTruthy()
    expect(payload.packageManager).toBe("bun")
    expect(payload.config.framework).toBe("react")
  })

  it("prints CDN resolution details when --cdn flag is set", async () => {
    await writeJson(path.join(fixture, "ui8kit.config.json"), {
      framework: "react",
      typescript: true,
      globalCss: "styles.css",
      aliases: {},
      registry: "@ui8kit",
      dir: "src",
      registryUrl: "https://cdn.example.com/registry/@ui8kit/r",
      registryVersion: "1.5.1",
      strictCdn: true,
    })

    vi.mocked(packageManager.detectPackageManager).mockResolvedValue("bun")
    fetchSpy.mockResolvedValue({ status: 200 } as Response)

    output.length = 0
    await infoCommand({ cdn: true })

    const logs = output.join("\n")
    expect(logs).toContain("CDN Resolution")
    expect(logs).toContain("registryUrl override: https://cdn.example.com/registry/@ui8kit/r")
    expect(logs).toContain("registryVersion: 1.5.1")
    expect(logs).toContain("strictCdn: enabled")
  })
})
