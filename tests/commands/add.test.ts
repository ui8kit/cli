import { describe, it, expect } from "vitest"
import { SCHEMA_CONFIG } from "../../src/utils/schema-config.js"
import { inferTargetFromType, resolveFileInstallPath, resolveInstallDir } from "../../src/utils/paths.js"
import { type Config } from "../../src/registry/schema.js"

describe("path contracts", () => {
  const baseConfig: Config = {
    framework: "svelte",
    typescript: true,
    globalCss: "src/app.css",
    dir: "src",
    aliases: SCHEMA_CONFIG.defaultAliases,
    registry: SCHEMA_CONFIG.defaultRegistry,
  }

  it("maps component types to canonical folders", () => {
    expect(inferTargetFromType("registry:ui")).toBe("components/ui")
    expect(inferTargetFromType("registry:lib")).toBe("lib")
    expect(inferTargetFromType("registry:utils")).toBe("utils")
    expect(inferTargetFromType("registry:widget")).toBe("widgets")
  })

  it("resolves install dirs under dir", () => {
    expect(resolveInstallDir("ui", baseConfig)).toBe("src/components/ui")
    expect(resolveInstallDir("lib", baseConfig)).toBe("src/lib")
    expect(resolveInstallDir("utils", baseConfig)).toBe("src/utils")
  })

  it("preserves nested brick paths", () => {
    const path = resolveFileInstallPath(
      {
        path: "ui/button/Button.svelte",
        content: "",
        target: "components/ui/button/Button.svelte",
      },
      "registry:ui",
      baseConfig,
    )
    expect(path).toBe("src/components/ui/button/Button.svelte")
  })

  it("preserves path without target under type folder", () => {
    const path = resolveFileInstallPath(
      { path: "ui/button/button.variants.json", content: "" },
      "registry:ui",
      baseConfig,
    )
    expect(path).toBe("src/components/ui/button/button.variants.json")
  })

  it("honors paths.ui remap (kit)", () => {
    const config: Config = {
      ...baseConfig,
      dir: "web/src",
      paths: { ui: "kit" },
    }
    const path = resolveFileInstallPath(
      { path: "ui/button/Button.svelte", content: "" },
      "registry:ui",
      config,
    )
    expect(path).toBe("web/src/kit/button/Button.svelte")
  })
})
