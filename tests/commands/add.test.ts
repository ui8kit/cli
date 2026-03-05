import { describe, it, expect } from "vitest"
import { SCHEMA_CONFIG } from "../../src/utils/schema-config.js"
import { inferTargetFromType, resolveInstallDir } from "../../src/commands/add.js"
import { type Config } from "../../src/registry/schema.js"

describe("add command helpers", () => {
  const baseConfig: Config = {
    framework: "vite-react",
    typescript: true,
    globalCss: "src/index.css",
    aliases: SCHEMA_CONFIG.defaultAliases,
    registry: SCHEMA_CONFIG.defaultRegistry,
    componentsDir: "./client/components",
    libDir: "./client/lib"
  }

  it("maps component types to install targets", () => {
    expect(inferTargetFromType("registry:ui")).toBe("ui")
    expect(inferTargetFromType("registry:lib")).toBe("lib")
    expect(inferTargetFromType("registry:component")).toBe("components")
    expect(inferTargetFromType("registry:layout")).toBe("layouts")
  })

  it("resolves custom install directories", () => {
    expect(resolveInstallDir("ui", baseConfig)).toBe("client/components/ui")
    expect(resolveInstallDir("components", baseConfig)).toBe("client/components")
    expect(resolveInstallDir("lib", baseConfig)).toBe("client/lib")
    expect(resolveInstallDir("blocks", baseConfig)).toBe("src/blocks")
  })
})
