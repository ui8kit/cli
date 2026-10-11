import { describe, it, expect, vi, afterEach } from "vitest"
import { logger } from "../../src/utils/logger.js"
import { classifyEdge, normalizeDependencyName, resolveRegistryTree } from "../../src/utils/dependency-resolver.js"
import { Component } from "../../src/registry/schema.js"
import { type RegistryType } from "../../src/utils/schema-config.js"

const TYPE: RegistryType = "ui"

function component(
  name: string,
  registryDependencies: string[] = [],
  files: string[] = []
): Component {
  return {
    name,
    type: "registry:ui",
    files: files.map(file => ({ path: `${file}.tsx`, content: "export {}\n" })),
    dependencies: [],
    devDependencies: [],
    registryDependencies,
    description: "",
  }
}

function mockGetComponent(components: Record<string, Component>) {
  return async (name: string, _registryType: RegistryType) => components[name.toLowerCase()] ?? null
}

describe("dependency resolver", () => {
  it("resolves component without deps", async () => {
    const components = { button: component("button") }
    const resolved = await resolveRegistryTree(["button"], TYPE, mockGetComponent(components))
    expect(resolved.map(item => item.name)).toEqual(["button"])
  })

  it("resolves chain in topological order", async () => {
    const components = {
      a: component("a", ["b"]),
      b: component("b", ["c"]),
      c: component("c", [])
    }
    const resolved = await resolveRegistryTree(["a"], TYPE, mockGetComponent(components))
    expect(resolved.map(item => item.name)).toEqual(["c", "b", "a"])
  })

  it("handles cycles without crashing", async () => {
    const components = {
      a: component("a", ["b"]),
      b: component("b", ["a"])
    }
    const resolved = await resolveRegistryTree(["a", "b"], TYPE, mockGetComponent(components))
    const names = resolved.map(item => item.name).sort()
    expect(names).toEqual(["a", "b"])
  })

  it("deduplicates duplicate component requests", async () => {
    const components = {
      a: component("a"),
      b: component("b")
    }
    const resolved = await resolveRegistryTree(["a", "a", "b"], TYPE, mockGetComponent(components))
    expect(resolved.map(item => item.name).sort()).toEqual(["a", "b"])
  })
})

describe("dependency resolver: typed deps and cycles (gaps 2 and 4)", () => {
  afterEach(() => {
    logger.setVerbose(false)
    vi.restoreAllMocks()
  })

  const withContent = (name: string, deps: string[], files: Array<[string, string]>, type = "registry:component"): Component => ({
    name,
    type,
    files: files.map(([target, content]) => ({ path: target, target, content })),
    dependencies: [],
    devDependencies: [],
    registryDependencies: deps,
  })

  const featureGrid = withContent("feature-grid", ["feature-cards"], [
    ["blocks/feature-grid.svelte", `import type { F } from "./feature-grid.types"\nimport C from "../components/feature-cards.svelte"`],
    ["blocks/feature-grid.types.ts", "export type F = {}"],
  ])
  const featureCards = withContent("feature-cards", ["feature-grid"], [
    ["components/feature-cards.svelte", `import type { F } from "../blocks/feature-grid.types"`],
  ])

  it("normalizeDependencyName maps utils/x and lib/x to the item name", () => {
    expect(normalizeDependencyName("lib/Presets")).toBe("presets")
    expect(normalizeDependencyName("utils/utils")).toBe("utils")
    expect(normalizeDependencyName("Button")).toBe("button")
  })

  it("resolves `utils` and `lib/presets` registryDependencies instead of skipping them", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})
    const components: Record<string, Component> = {
      block: { ...component("block", ["utils", "lib/presets"]), type: "registry:block" },
      utils: { ...component("utils"), type: "registry:utils" },
      "lib/presets": { ...component("presets"), type: "registry:lib" },
    }
    const resolved = await resolveRegistryTree(["block"], TYPE, mockGetComponent(components))
    expect(resolved.map((c) => c.name).sort()).toEqual(["block", "presets", "utils"])
    expect(warn).not.toHaveBeenCalled()
  })

  it("installs `presets` once when it is listed as both `presets` and `lib/presets`", async () => {
    const components: Record<string, Component> = {
      a: component("a", ["presets", "b"]),
      b: component("b", ["lib/presets"]),
      presets: { ...component("presets"), type: "registry:lib" },
      "lib/presets": { ...component("presets"), type: "registry:lib" },
    }
    const resolved = await resolveRegistryTree(["a"], TYPE, mockGetComponent(components))
    expect(resolved.filter((c) => c.name === "presets")).toHaveLength(1)
  })

  it("still warns for a dependency that really is missing", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})
    await resolveRegistryTree(["a"], TYPE, mockGetComponent({ a: component("a", ["ghost"]) }))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ghost not found"))
  })

  it("classifyEdge: type-only import, value import, and no import", () => {
    expect(classifyEdge(featureCards, featureGrid)).toBe("type-only")
    expect(classifyEdge(featureGrid, featureCards)).toBe("value")
    expect(classifyEdge(featureGrid, withContent("other", [], [["x/other.svelte", ""]]))).toBe("unknown")
  })

  it("type-only cycle (feature-grid <-> feature-cards): no warning, each item once", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const resolved = await resolveRegistryTree(["feature-grid", "feature-cards"], TYPE, mockGetComponent({
      "feature-grid": featureGrid,
      "feature-cards": featureCards,
    }))
    expect(resolved.map((c) => c.name).sort()).toEqual(["feature-cards", "feature-grid"])
    expect(warn).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it("cycle edges are reported as informational only with --verbose", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const get = mockGetComponent({ "feature-grid": featureGrid, "feature-cards": featureCards })
    logger.setVerbose(true)
    await resolveRegistryTree(["feature-grid"], TYPE, get)
    const lines = log.mock.calls.map((c) => String(c[1] ?? c[0]) + " " + String(c[0]))
    expect(lines.join("\n")).toMatch(/type-only dependency edge: feature-cards -> feature-grid/)
    expect(lines.join("\n")).not.toMatch(/Circular|Unresolved/)
  })

  it("mixed cycle (value one way, type the other) is quiet by default", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})
    const frame = withContent("section-frame", ["section-header"], [
      ["components/section-frame.svelte", `import H from "./section-header.svelte"`],
    ])
    const header = withContent("section-header", ["section-frame"], [
      ["components/section-header.svelte", `import type { X } from "./section-frame.types"`],
      ["components/section-header.types.ts", ""],
    ])
    const frameWithTypes = { ...frame, files: [...frame.files, { path: "components/section-frame.types.ts", target: "components/section-frame.types.ts", content: "" }] }
    const resolved = await resolveRegistryTree(["section-frame"], TYPE, mockGetComponent({ "section-frame": frameWithTypes, "section-header": header }))
    expect(resolved).toHaveLength(2)
    expect(warn).not.toHaveBeenCalled()
  })

  it("a cycle made only of value imports gets one concise warning, items still installed once", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})
    const a = withContent("loop-a", ["loop-b"], [["c/loop-a.tsx", `import { b } from "./loop-b"`]])
    const b = withContent("loop-b", ["loop-a"], [["c/loop-b.tsx", `import { a } from "./loop-a"`]])
    const resolved = await resolveRegistryTree(["loop-a", "loop-b"], TYPE, mockGetComponent({ "loop-a": a, "loop-b": b }))
    expect(resolved).toHaveLength(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatch(/Runtime import cycle between/)
  })

  it("orders non-cyclic dependents after the cycle (back edges do not break topological order)", async () => {
    const top = withContent("top", ["feature-grid"], [["blocks/top.svelte", ""]])
    const resolved = await resolveRegistryTree(["top"], TYPE, mockGetComponent({
      top,
      "feature-grid": featureGrid,
      "feature-cards": featureCards,
    }))
    expect(resolved[resolved.length - 1]!.name).toBe("top")
  })
})
