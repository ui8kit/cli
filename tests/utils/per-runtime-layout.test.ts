import { describe, expect, it } from "vitest"
import path from "node:path"
import {
  assertKnownRuntime,
  filterFilesForRuntime,
  matchesRuntimeFile,
} from "../../src/utils/runtime-files.js"
import { assertInsideRoot, assertSafeRegistryPath, resolveFileInstallPath } from "../../src/utils/paths.js"
import { assertKnownInitOptions } from "../../src/commands/init.js"
import type { Config } from "../../src/registry/schema.js"

const files = [
  "ui/button/button.tsx",
  "ui/button/button.solid.tsx",
  "ui/button/button.wc.ts",
  "ui/button/Button.svelte",
  "ui/button/Button.vue",
  "ui/button/button.shared.ts",
].map((p) => ({ path: p, target: p }))

const names = (runtime: string) =>
  filterFilesForRuntime(files, runtime).map((f) => f.target.split("/").pop()).sort()

describe("webcomponent runtime slice", () => {
  it("keeps only .wc.ts + shared for webcomponent", () => {
    expect(names("webcomponent")).toEqual(["button.shared.ts", "button.wc.ts"])
  })

  it("excludes .wc.ts from every other JS runtime", () => {
    for (const rt of ["react", "solid", "svelte", "vue"]) {
      expect(names(rt)).not.toContain("button.wc.ts")
    }
    expect(matchesRuntimeFile("button.wc.ts", "react")).toBe(false)
  })

  it("unknown runtimes match nothing and are rejected", () => {
    expect(matchesRuntimeFile("button.tsx", "angular")).toBe(false)
    expect(() => assertKnownRuntime("angular")).toThrow(/Unknown --runtime "angular"/)
    expect(() => assertKnownRuntime("webcomponent")).not.toThrow()
    expect(() => assertKnownRuntime(undefined)).not.toThrow()
  })

  it("init accepts webcomponent and rejects unknown framework/runtime", () => {
    expect(() => assertKnownInitOptions({ framework: "webcomponent" })).not.toThrow()
    expect(() => assertKnownInitOptions({ framework: "angular" })).toThrow(/Unknown --framework/)
    expect(() => assertKnownInitOptions({ runtime: "nope" })).toThrow(/Unknown --runtime/)
  })
})

describe("install path safety", () => {
  const config = { framework: "react", dir: "src", aliases: {}, registry: "@ui8kit", typescript: true } as unknown as Config

  it("rejects '..' segments and absolute targets", () => {
    for (const target of ["../.cursor/rules/x.mdc", "ui/../../etc/x", "/abs/x", "C:/x", "a\\..\\b"]) {
      expect(() => assertSafeRegistryPath(target)).toThrow(/Unsafe install path/)
      expect(() =>
        resolveFileInstallPath({ path: "x", target, content: "" } as never, "registry:ui", config),
      ).toThrow(/Unsafe install path/)
    }
  })

  it("rejects a '..' in path when no target is set", () => {
    expect(() =>
      resolveFileInstallPath({ path: "../x.ts", content: "" } as never, "registry:ui", config),
    ).toThrow(/Unsafe install path/)
  })

  it("allows normal relative targets (dots inside names are fine)", () => {
    expect(resolveFileInstallPath({ path: "x", target: "ui/button/button..x.ts", content: "" } as never, "registry:ui", config)).toBe(
      "src/ui/button/button..x.ts",
    )
    expect(resolveFileInstallPath({ path: "x", target: "utils/cn.ts", content: "" } as never, "registry:utils", config)).toBe(
      "src/utils/cn.ts",
    )
  })

  it("assertInsideRoot guards the final write path", () => {
    expect(assertInsideRoot("/proj", "src/ui/a.ts")).toBe(path.resolve("/proj", "src/ui/a.ts"))
    expect(() => assertInsideRoot("/proj", "../x")).toThrow(/outside the project/)
  })
})
