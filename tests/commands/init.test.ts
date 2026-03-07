import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fetch from "node-fetch"
import * as packageManager from "../../src/utils/package-manager.js"
import { buildInitConfig, initCommand } from "../../src/commands/init.js"
import { SCHEMA_CONFIG } from "../../src/utils/schema-config.js"

vi.mock("node-fetch", () => ({
  default: vi.fn()
}))

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-init-test-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

async function writeJson(filePath: string, value: any) {
  await fs.ensureDir(path.dirname(filePath))
  await fs.writeJson(filePath, value)
}

function mockRegistryResponseMap(baseUrl: string) {
  const indexUrl = `${baseUrl}/index.json`
  const libUrl = `${baseUrl}/components/lib/utils.json`
  const variantUrl = `${baseUrl}/components/variants/index.json`
  const responses: Record<string, any> = {
    [indexUrl]: {
      components: [
        { name: "utils", type: "registry:lib" },
        { name: "index", type: "registry:variants" }
      ]
    },
    [libUrl]: {
      name: "utils",
      type: "registry:lib",
      dependencies: ["class-variance-authority", "clsx"],
      devDependencies: [],
      files: [{ path: "components/lib/utils.tsx", content: "export const x = 1\n" }]
    },
    [variantUrl]: {
      name: "index",
      type: "registry:variants",
      dependencies: ["class-variance-authority", "tailwind-merge"],
      devDependencies: [],
      files: [{ path: "components/variants/index.ts", content: "export const y = 2\n" }]
    }
  }

  return responses
}

describe("init config generation", () => {
  it("creates default config with required fields", () => {
    const config = buildInitConfig({ yes: true, registry: "ui" })
    expect(config.typescript).toBe(true)
    expect(config.globalCss).toBe("src/index.css")
    expect(config.framework).toBe("vite-react")
    expect(config.componentsDir).toBeDefined()
    expect(config.libDir).toBeDefined()
  })

  it("applies custom alias and global css", () => {
    const config = buildInitConfig({
      yes: false,
      registry: "ui",
      globalCss: "styles.css",
      aliasComponents: "@/ui"
    })
    expect(config.globalCss).toBe("styles.css")
    expect(config.aliases["@/components"]).toBe("@/ui")
  })

  it("uses package-import style by default", () => {
    const config = buildInitConfig({ yes: true, registry: "ui" })
    expect(config.importStyle).toBe("alias")
  })
})

describe("init dependency aggregation", () => {
  let fixture = ""
  const originalCwd = process.cwd()

  beforeEach(async () => {
    fixture = tempDir()
    await fs.ensureDir(fixture)
    process.chdir(fixture)

    await writeJson(path.join(fixture, "package.json"), {
      name: "test-project",
      version: "1.0.0",
      dependencies: { react: "18.3.1" }
    })
    await fs.writeFile(path.join(fixture, "vite.config.ts"), "export default {}")
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await fs.remove(fixture)
  })

  it("aggregates core npm dependencies from fetched registry components", async () => {
    const mockedFetch = vi.mocked(fetch)
    const registryUrl = "https://cdn.example.com/@ui8kit/registry@latest/r"
    const responses = mockRegistryResponseMap(registryUrl)
    const installDependenciesSpy = vi.spyOn(packageManager, "installDependencies").mockResolvedValue(undefined as never)

    mockedFetch.mockImplementation(async (url: string | URL) => {
      const requested = String(url)
      const responseBody = responses[requested]
      if (!responseBody) {
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: async () => ({})
        } as any
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => responseBody
      } as any
    })

    await initCommand({
      yes: true,
      registry: "ui",
      registryUrl
    })

    expect(installDependenciesSpy).toHaveBeenCalledTimes(1)
    expect(installDependenciesSpy).toHaveBeenCalledWith(
      expect.arrayContaining(["class-variance-authority", "clsx", "tailwind-merge"])
    )
  })

  it("does not create blocks/layouts base directories directly in init anymore", async () => {
    const mockedFetch = vi.mocked(fetch)
    const registryUrl = "https://cdn.example.com/@ui8kit/registry@latest/r"
    const responses = mockRegistryResponseMap(registryUrl)
    vi.spyOn(packageManager, "installDependencies").mockResolvedValue(undefined as never)
    const ensureDirSpy = vi.spyOn(fs, "ensureDir").mockResolvedValue(undefined as never)

    mockedFetch.mockImplementation(async (url: string | URL) => {
      const requested = String(url)
      const responseBody = responses[requested]
      if (!responseBody) {
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: async () => ({})
        } as any
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => responseBody
      } as any
    })

    await initCommand({
      yes: true,
      registry: "ui",
      registryUrl
    })

    const createdDirs = new Set(ensureDirSpy.mock.calls.map(([dir]) => path.resolve(String(dir))))
    expect(createdDirs).not.toContain(path.resolve(fixture, SCHEMA_CONFIG.defaultDirectories.blocks))
    expect(createdDirs).not.toContain(path.resolve(fixture, SCHEMA_CONFIG.defaultDirectories.layouts))
  })
})
