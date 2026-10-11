import { describe, expect, it } from "vitest"
import { applyPathOverrides, mapTargetByPaths, resolveFileInstallPath } from "../../src/utils/paths.js"
import type { Config } from "../../src/registry/schema.js"

const base = (extra: Partial<Config> = {}): Config =>
  ({
    framework: "svelte",
    typescript: true,
    globalCss: "src/index.css",
    dir: "src",
    aliases: {},
    registry: "@ui8kit",
    ...extra,
  }) as Config

const file = (target: string) => ({ path: target, target, content: "" })

describe("paths precedence (gap 3): CLI flag > config.paths by target prefix > file target", () => {
  it("file target wins when no paths are configured (backward compatible)", () => {
    expect(resolveFileInstallPath(file("primitives/button/button.svelte"), "registry:ui", base())).toBe(
      "src/primitives/button/button.svelte",
    )
    expect(resolveFileInstallPath(file("components/ui/button/Button.svelte"), "registry:ui", base())).toBe(
      "src/components/ui/button/Button.svelte",
    )
  })

  it("legacy src/ and dir-prefixed targets behave as before without paths", () => {
    expect(resolveFileInstallPath(file("src/utils/cn.ts"), "registry:utils", base())).toBe("src/utils/cn.ts")
    expect(resolveFileInstallPath(file("src/utils/cn.ts"), "registry:utils", base({ dir: "web/src" }))).toBe("web/src/utils/cn.ts")
    expect(resolveFileInstallPath(file("web/src/utils/cn.ts"), "registry:utils", base({ dir: "web/src" }))).toBe("web/src/utils/cn.ts")
  })

  it("config.paths remaps a canonical target prefix", () => {
    const config = base({ paths: { ui: "kit" } })
    expect(resolveFileInstallPath(file("components/ui/button/Button.svelte"), "registry:ui", config)).toBe(
      "src/kit/button/Button.svelte",
    )
  })

  it("config.paths remaps a registry-specific first folder via the item type", () => {
    const config = base({ paths: { ui: "kit", lib: "shared" } })
    expect(resolveFileInstallPath(file("primitives/button/button.svelte"), "registry:ui", config)).toBe(
      "src/kit/button/button.svelte",
    )
    expect(resolveFileInstallPath(file("presets/defaults.ts"), "registry:lib", config)).toBe("src/shared/defaults.ts")
  })

  it("only keys that are configured are remapped", () => {
    const config = base({ paths: { ui: "kit" } })
    expect(resolveFileInstallPath(file("blocks/hero.svelte"), "registry:block", config)).toBe("src/blocks/hero.svelte")
    expect(resolveFileInstallPath(file("utils/cn.ts"), "registry:utils", config)).toBe("src/utils/cn.ts")
  })

  it("longest canonical prefix wins (components/ui before components)", () => {
    const config = base({ paths: { components: "parts" } })
    expect(mapTargetByPaths("components/ui/x.svelte", "registry:ui", config)).toBe("components/ui/x.svelte")
    expect(mapTargetByPaths("components/x.svelte", "registry:component", config)).toBe("parts/x.svelte")
  })

  it("remaps dir-prefixed targets too", () => {
    const config = base({ paths: { utils: "helpers" } })
    expect(resolveFileInstallPath(file("src/utils/cn.ts"), "registry:utils", config)).toBe("src/helpers/cn.ts")
  })

  it("--path flags override config.paths (flag > config)", () => {
    const merged = applyPathOverrides(base({ paths: { ui: "kit", blocks: "sections" } }), ["ui=flagged"])
    expect(resolveFileInstallPath(file("primitives/b/b.svelte"), "registry:ui", merged)).toBe("src/flagged/b/b.svelte")
    expect(resolveFileInstallPath(file("blocks/h.svelte"), "registry:block", merged)).toBe("src/sections/h.svelte")
  })

  it("--path flag works without any config.paths and does not mutate the config", () => {
    const config = base()
    const merged = applyPathOverrides(config, ["ui=kit"])
    expect(config.paths).toBeUndefined()
    expect(resolveFileInstallPath(file("components/ui/b/b.svelte"), "registry:ui", merged)).toBe("src/kit/b/b.svelte")
  })

  it("applyPathOverrides rejects malformed pairs and unknown keys", () => {
    expect(() => applyPathOverrides(base(), ["ui"])).toThrow(/Expected key=dir/)
    expect(() => applyPathOverrides(base(), ["ui="])).toThrow(/Expected key=dir/)
    expect(() => applyPathOverrides(base(), ["nope=x"])).toThrow(/Unknown --path key "nope"/)
    expect(applyPathOverrides(base(), [])).toEqual(base())
  })

  it("files without a target keep using config.paths as before", () => {
    const config = base({ paths: { ui: "kit" } })
    expect(resolveFileInstallPath({ path: "components/ui/button.svelte", content: "" }, "registry:ui", config)).toBe(
      "src/kit/button.svelte",
    )
  })
})
