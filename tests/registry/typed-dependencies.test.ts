import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
// @ts-expect-error plain .mjs helpers
import { buildFixtureRegistry } from "../fixtures/build-fixture-registry.mjs"
// @ts-expect-error plain .mjs helpers
import { serveDir } from "../helpers/static-server.mjs"
import { getComponent, getAllComponents, resetCache } from "../../src/registry/api.js"

let dir = ""
let server: { url: string; close: () => Promise<void> }

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-typed-"))
  buildFixtureRegistry(dir)
  server = await serveDir(dir)
})

afterAll(async () => {
  await server.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

afterEach(() => {
  resetCache()
  vi.unstubAllGlobals()
})

const opts = (rt: string, extra: Record<string, unknown> = {}) => ({
  noCache: true,
  cdn: { registryUrl: `${server.url}/${rt}`, strictCdn: true },
  ...extra,
})

describe("registry:utils / registry:lib resolution (gap 2)", () => {
  it("`utils` resolves against utils/utils.json", async () => {
    const item = await getComponent("utils", "ui", opts("svelte"))
    expect(item?.type).toBe("registry:utils")
    expect(item?.files.map((f) => f.target)).toContain("utils/cn.ts")
  })

  it("`lib/presets` and `presets` resolve against lib/presets.json", async () => {
    const typed = await getComponent("lib/presets", "ui", opts("svelte"))
    const bare = await getComponent("presets", "ui", opts("svelte"))
    expect(typed?.type).toBe("registry:lib")
    expect(bare?.name).toBe("presets")
  })

  it("`utils/utils` resolves as the utils item", async () => {
    expect((await getComponent("utils/utils", "ui", opts("react")))?.type).toBe("registry:utils")
  })

  it("catalog exclusion (excludeTypes) still hides utils/lib from listings", async () => {
    const listed = await getAllComponents("ui", opts("svelte", { excludeTypes: ["registry:lib", "registry:utils"] }))
    expect(listed.map((c) => c.name)).not.toContain("utils")
    expect(listed.map((c) => c.name)).not.toContain("presets")
    expect(listed.map((c) => c.name)).toContain("button")
  })

  it("excludeTypes also blocks the typed endpoint fallback (explicit opt-out)", async () => {
    expect(await getComponent("utils", "ui", opts("svelte", { excludeTypes: ["registry:utils"] }))).toBeNull()
    expect(await getComponent("lib/presets", "ui", opts("svelte", { excludeTypes: ["registry:lib"] }))).toBeNull()
  })

  it("`utils` still resolves from its endpoint when the index does not list it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-noindex-"))
    buildFixtureRegistry(root, ["svelte"])
    const index = JSON.parse(fs.readFileSync(path.join(root, "svelte/index.json"), "utf8"))
    index.components = index.components.filter((c: { type: string }) => c.type !== "registry:utils" && c.type !== "registry:lib")
    fs.writeFileSync(path.join(root, "svelte/index.json"), JSON.stringify(index))
    const srv = await serveDir(root)
    try {
      const o = { noCache: true, cdn: { registryUrl: `${srv.url}/svelte`, strictCdn: true } }
      expect((await getComponent("utils", "ui", o))?.type).toBe("registry:utils")
      expect((await getComponent("lib/presets", "ui", o))?.type).toBe("registry:lib")
      expect(await getComponent("presets", "ui", o)).toBeNull() // bare lib names need the index
    } finally {
      await srv.close()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("registryUrl / strictCdn keep working", () => {
  it("strictCdn: only the explicit registryUrl is contacted", async () => {
    const urls: string[] = []
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(String(url))
      return new Response("nope", { status: 404 })
    })
    const result = await getComponent("button", "ui", {
      noCache: true,
      cdn: { registryUrl: "http://registry.invalid/svelte", strictCdn: true },
    })
    expect(result).toBeNull()
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => u.startsWith("http://registry.invalid/svelte/"))).toBe(true)
  })

  it("without strictCdn the default CDNs are tried after registryUrl", async () => {
    const urls: string[] = []
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(String(url))
      return new Response("nope", { status: 404 })
    })
    await getComponent("button", "ui", {
      noCache: true,
      cdn: { registryUrl: "http://registry.invalid/svelte" },
    })
    expect(urls[0]).toMatch(/^http:\/\/registry\.invalid\/svelte\//)
    expect(urls.some((u) => u.includes("unpkg.com") || u.includes("jsdelivr"))).toBe(true)
  })

  it("two registryUrls do not share the on-disk item cache", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-home-"))
    const prev = process.env.HOME
    process.env.HOME = home
    try {
      const svelte = await getComponent("button", "ui", { cdn: { registryUrl: `${server.url}/svelte`, strictCdn: true } })
      resetCache()
      const react = await getComponent("button", "ui", { cdn: { registryUrl: `${server.url}/react`, strictCdn: true } })
      expect(svelte?.files[0]?.target).toMatch(/button\.svelte$/)
      expect(react?.files[0]?.target).toMatch(/button\.tsx$/)
    } finally {
      process.env.HOME = prev
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})
