import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fetchModule from "node-fetch"
import { getCdnUrls } from "../../src/utils/schema-config.js"

vi.mock("node-fetch", () => ({
  default: vi.fn()
}))

type ApiModule = typeof import("../../src/registry/api.js")

function createMockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 400,
    status,
    statusText: String(status),
    json: async () => body
  } as any
}

describe("CDN resolution integration", () => {
  let getAllComponents: ApiModule["getAllComponents"]

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const api = await import("../../src/registry/api.js")
    getAllComponents = api.getAllComponents
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("resolves CDN order with unpkg first, jsdelivr second", () => {
    const urls = getCdnUrls("ui")
    expect(urls[0]).toContain("unpkg.com")
    expect(urls[1]).toContain("cdn.jsdelivr.net")
    expect(urls[2]).toContain("raw.githubusercontent.com")
  })

  it("applies version overrides to explicit CDN URLs", async () => {
    const calls: string[] = []
    vi.mocked(fetchModule.default).mockImplementation(async (target: string) => {
      calls.push(target)
      return createMockResponse(200, { components: [] })
    })

    await getAllComponents("ui", {
      cdn: {
        registryUrl: "https://cdn.example.com/@ui8kit/registry@latest/r",
        registryVersion: "1.5.1",
        strictCdn: true
      },
      noCache: true
    })

    expect(calls[0]).toContain("https://cdn.example.com/@ui8kit/registry@1.5.1/r/index.json")
  })

  it("falls back to default CDN list when override fails", async () => {
    const calls: string[] = []
    vi.mocked(fetchModule.default).mockImplementation(async (target: string) => {
      calls.push(target)
      if (target.includes("bad-registry.example.com")) {
        return createMockResponse(500, { error: "unavailable" })
      }
      return createMockResponse(200, { components: [] })
    })

    await getAllComponents("ui", {
      cdn: {
        registryUrl: "https://bad-registry.example.com/@ui8kit/registry@latest/r",
        strictCdn: false
      },
      noCache: true
    })

    expect(calls[0]).toContain("bad-registry.example.com")
    expect(calls[1]).toContain("unpkg.com")
    expect(calls).toHaveLength(2)
  })

  it("does not fall back when strict mode is enabled", async () => {
    const calls: string[] = []
    vi.mocked(fetchModule.default).mockImplementation(async (target: string) => {
      calls.push(target)
      return createMockResponse(500, { error: "unavailable" })
    })

    await getAllComponents("ui", {
      cdn: {
        registryUrl: "https://bad-registry.example.com/@ui8kit/registry@latest/r",
        strictCdn: true
      },
      noCache: true
    })

    expect(calls[0]).toContain("bad-registry.example.com")
    expect(calls).toHaveLength(1)
  })
})

