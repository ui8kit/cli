import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getCdnUrls } from "../../src/utils/schema-config.js"

type ApiModule = typeof import("../../src/registry/api.js")

function createMockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 400,
    status,
    statusText: String(status),
    json: async () => body,
  } as Response
}

describe("CDN resolution integration", () => {
  let getAllComponents: ApiModule["getAllComponents"]
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const api = await import("../../src/registry/api.js")
    getAllComponents = api.getAllComponents
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("resolves CDN order with unpkg first, jsdelivr second", () => {
    const urls = getCdnUrls("ui")
    expect(urls[0]).toContain("unpkg.com")
    expect(urls[1]).toContain("cdn.jsdelivr.net")
    expect(urls).toHaveLength(2)
    expect(urls.some((u) => u.includes("raw.githubusercontent.com"))).toBe(false)
  })

  it("defaults to the CLI's major range instead of @latest", () => {
    const urls = getCdnUrls("ui")
    expect(urls[0]).toMatch(/@ui8kit\/registry@\d+\/r$/)
    expect(urls.join()).not.toContain("@latest")
    expect(getCdnUrls("ui", { registryVersion: "3.0.0" })[0]).toBe("https://unpkg.com/@ui8kit/registry@3.0.0/r")
    expect(getCdnUrls("ui", { registryVersion: "canary", runtime: "react" })[1]).toBe(
      "https://cdn.jsdelivr.net/npm/@ui8kit/registry@canary/r/react",
    )
  })

  it("applies version overrides to explicit CDN URLs", async () => {
    const calls: string[] = []
    fetchSpy.mockImplementation(async (target: string) => {
      calls.push(String(target))
      return createMockResponse(200, { components: [] })
    })

    await getAllComponents("ui", {
      cdn: {
        registryUrl: "https://cdn.example.com/@ui8kit/registry@latest/r",
        registryVersion: "1.5.1",
        strictCdn: true,
      },
      noCache: true,
    })

    expect(calls[0]).toContain("https://cdn.example.com/@ui8kit/registry@1.5.1/r/index.json")
  })

  it("falls back to default CDN list when override fails", async () => {
    const calls: string[] = []
    fetchSpy.mockImplementation(async (target: string) => {
      calls.push(String(target))
      if (String(target).includes("bad-registry.example.com")) {
        return createMockResponse(500, { error: "unavailable" })
      }
      return createMockResponse(200, { components: [] })
    })

    await getAllComponents("ui", {
      cdn: {
        registryUrl: "https://bad-registry.example.com/@ui8kit/registry@latest/r",
        strictCdn: false,
      },
      noCache: true,
    })

    expect(calls[0]).toContain("bad-registry.example.com")
    expect(calls[1]).toContain("unpkg.com")
    expect(calls).toHaveLength(2)
  })

  it("does not fall back when strict mode is enabled", async () => {
    const calls: string[] = []
    fetchSpy.mockImplementation(async (target: string) => {
      calls.push(String(target))
      return createMockResponse(500, { error: "unavailable" })
    })

    await getAllComponents("ui", {
      cdn: {
        registryUrl: "https://bad-registry.example.com/@ui8kit/registry@latest/r",
        strictCdn: true,
      },
      noCache: true,
    })

    expect(calls[0]).toContain("bad-registry.example.com")
    expect(calls).toHaveLength(1)
  })
})
