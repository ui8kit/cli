import { describe, it, expect } from "vitest"
import { buildInitConfig } from "../../src/commands/init.js"

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
})
