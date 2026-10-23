import { describe, it, expect, vi, afterEach } from "vitest"
import {
  SCHEMA_CONFIG,
  getCdnUrls,
  getCliMajor,
  getSchemaUrl,
  hasNpmVersionSegment,
} from "../../src/utils/schema-config.js"
import { CLI_MESSAGES } from "../../src/utils/cli-messages.js"
import { defaultAliasesForDir } from "../../src/utils/paths.js"
import { buildInitConfig } from "../../src/commands/init.js"
import { dropReactOnlyItems } from "../../src/commands/add.js"
import { logger } from "../../src/utils/logger.js"

afterEach(() => vi.restoreAllMocks())

describe("3.2.1: schema URL follows the CLI major", () => {
  it("baseUrl and troubleshooting hint use @<cli major>", () => {
    const major = getCliMajor()
    expect(major).not.toBe("")
    expect(SCHEMA_CONFIG.baseUrl).toBe(`https://cdn.jsdelivr.net/npm/@ui8kit/registry@${major}/schema`)
    expect(getSchemaUrl()).toContain(`@ui8kit/registry@${major}/schema/schema.json`)
    expect(CLI_MESSAGES.examples.troubleshooting.join("\n")).toContain(`@ui8kit/registry@${major}/r/<runtime>/index.json`)
  })
})

describe("3.2.1: default directories/aliases match init and add", () => {
  it("SCHEMA_CONFIG defaults equal init's aliases (ui → {dir}/ui)", () => {
    expect(SCHEMA_CONFIG.defaultAliases).toEqual(defaultAliasesForDir("src"))
    expect(SCHEMA_CONFIG.defaultAliases["@/ui"]).toBe("./src/ui")
    expect(SCHEMA_CONFIG.defaultDirectories.ui).toBe("./src/ui")
    expect(buildInitConfig({ yes: true, registry: "ui" }).aliases).toEqual(SCHEMA_CONFIG.defaultAliases)
    expect(defaultAliasesForDir("web/src")["@/ui"]).toBe("./web/src/ui")
  })
})

describe("3.2.1: --registry-version with a custom --registry-url", () => {
  it("replaces an npm-style @<version> segment (tag, range, exact)", () => {
    for (const v of ["latest", "3", "^3.1", "3.2.0"]) {
      const url = `https://cdn.example.com/npm/@ui8kit/registry@${v}/r/react`
      expect(hasNpmVersionSegment(url)).toBe(true)
      expect(getCdnUrls("ui", { registryUrl: url, registryVersion: "3.1.0", strictCdn: true })).toEqual([
        "https://cdn.example.com/npm/@ui8kit/registry@3.1.0/r/react",
      ])
    }
    expect(getCdnUrls("ui", { registryUrl: "https://unpkg.com/my-kit@2/r", registryVersion: "next", strictCdn: true }))
      .toEqual(["https://unpkg.com/my-kit@next/r"])
  })

  it("warns and keeps the URL when there is no version segment", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})
    const url = "https://kit.brand.example/v3/r/react"
    expect(hasNpmVersionSegment(url)).toBe(false)
    expect(getCdnUrls("ui", { registryUrl: url, registryVersion: "3.1.0", strictCdn: true })).toEqual([url])
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/--registry-version 3\.1\.0 ignored/)
  })

  it("without an explicit version, @latest still becomes the CLI major and no warning is printed", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})
    expect(getCdnUrls("ui", { registryUrl: "https://x.example/r", strictCdn: true })).toEqual(["https://x.example/r"])
    expect(getCdnUrls("ui", { registryUrl: "https://x.example/p@latest/r", strictCdn: true })).toEqual([
      `https://x.example/p@${getCliMajor()}/r`,
    ])
    expect(warn).not.toHaveBeenCalled()
  })
})

describe("3.2.1: slot is React-only", () => {
  it("drops slot for non-react runtimes with a clear message", () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => {})
    expect(dropReactOnlyItems(["slot", "button"], "vue")).toEqual(["button"])
    expect(String(error.mock.calls[0]?.[0])).toMatch(/React-only.*r\/react/)
  })
  it("keeps slot for react / unknown runtime", () => {
    expect(dropReactOnlyItems(["slot"], "react")).toEqual(["slot"])
    expect(dropReactOnlyItems(["slot"], undefined)).toEqual(["slot"])
  })
})
