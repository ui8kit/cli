import { describe, expect, it } from "vitest"
import { getCdnUrls, isPerRuntimeRegistryVersion } from "../../src/utils/schema-config.js"
import { buildInitConfig, renderRulesContent } from "../../src/commands/init.js"

describe("per-runtime registry (digest >= 3)", () => {
  it("detects 3.x digests", () => {
    expect(isPerRuntimeRegistryVersion("3.0.0")).toBe(true)
    expect(isPerRuntimeRegistryVersion("@3.1.0")).toBe(true)
    expect(isPerRuntimeRegistryVersion("2.0.0")).toBe(false)
    expect(isPerRuntimeRegistryVersion(undefined)).toBe(false)
  })

  it("appends /<runtime> to default CDN bases for 3.x, keeps explicit URL as-is", () => {
    const urls = getCdnUrls("ui", { registryVersion: "3.0.0", runtime: "vue", registryUrl: "http://localhost:4000/r/vue" })
    expect(urls[0]).toBe("http://localhost:4000/r/vue")
    expect(urls).toContain("https://unpkg.com/@ui8kit/registry@3.0.0/r/vue")
    expect(getCdnUrls("ui", { registryVersion: "2.0.0", runtime: "vue" })).toContain(
      "https://unpkg.com/@ui8kit/registry@2.0.0/r",
    )
    expect(getCdnUrls("ui", { runtime: "vue" })).toContain("https://unpkg.com/@ui8kit/registry@latest/r")
  })
})

describe("rules item substitution", () => {
  const rule = { name: "rules", type: "registry:rules", dependencies: [], devDependencies: [], files: [], meta: { kitTarget: "ui", globs: ["**/*.svelte"] } } as any

  it("substitutes {kit} and {globs} from dir", () => {
    const config = buildInitConfig({ yes: true, registry: "ui", framework: "svelte" })
    expect(renderRulesContent("globs: {globs}\nkit `{kit}` {other}", rule, config)).toBe(
      "globs: src/**/*.svelte\nkit `src/ui` {other}",
    )
  })

  it("respects dir and paths.ui", () => {
    const config = { ...buildInitConfig({ yes: true, registry: "ui", dir: "web/src" }), paths: { ui: "kit" } }
    expect(renderRulesContent("{kit}|{globs}", rule, config)).toBe("web/src/kit|web/src/**/*.svelte")
  })
})
