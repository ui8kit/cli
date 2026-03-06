import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { listCommand } from "../../src/commands/list.js"
import * as registryApi from "../../src/registry/api.js"
import { logger } from "../../src/utils/logger.js"
import { CLI_MESSAGES } from "../../src/utils/cli-messages.js"

describe("list command", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("outputs JSON when requested", async () => {
    const components = [
      {
        name: "button",
        type: "registry:ui",
        dependencies: [],
        devDependencies: [],
        files: []
      }
    ]

    vi.spyOn(registryApi, "getAllComponents").mockResolvedValue(components as any)

    await listCommand({ json: true })

    expect(console.log).toHaveBeenCalledWith(JSON.stringify(components, null, 2))
  })

  it("prints grouped and sorted output", async () => {
    const components = [
      {
        name: "layout-one",
        type: "registry:layout",
        dependencies: [],
        devDependencies: [],
        files: []
      },
      {
        name: "button",
        type: "registry:ui",
        dependencies: [],
        devDependencies: [],
        files: []
      },
      {
        name: "accordion",
        type: "registry:ui",
        dependencies: [],
        devDependencies: [],
        files: []
      }
    ]

    vi.spyOn(registryApi, "getAllComponents").mockResolvedValue(components as any)

    const outputSpy = vi.spyOn(console, "log")
    await listCommand()
    const output = outputSpy.mock.calls.map(([line]) => String(line)).join("\n")

    expect(output).toContain("Listing available components")
    expect(output).toContain("registry:layout (1 components)")
    expect(output).toContain("registry:ui (2 components)")
    expect(output).toContain("accordion")
    expect(output).toContain("button")
  })

  it("warns when no components are available", async () => {
    vi.spyOn(registryApi, "getAllComponents").mockResolvedValue([])
    const warnSpy = vi.spyOn(logger, "warn")

    await listCommand()

    expect(warnSpy).toHaveBeenCalledWith(CLI_MESSAGES.errors.registryTempUnavailable)
  })

  it("passes explicit CDN options to registry fetch", async () => {
    const getComponents = vi.spyOn(registryApi, "getAllComponents")
    getComponents.mockResolvedValue([])

    await listCommand({
      registryUrl: "https://cdn.example.com/@ui8kit/registry@latest/r",
      registryVersion: "1.5.1",
      strictCdn: true
    })

    expect(getComponents).toHaveBeenCalledWith("ui", {
      excludeTypes: ["registry:variants", "registry:lib"],
      noCache: false,
      cdn: {
        registryUrl: "https://cdn.example.com/@ui8kit/registry@latest/r",
        registryVersion: "1.5.1",
        strictCdn: true
      }
    })
  })
})
