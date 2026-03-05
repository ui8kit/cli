import { describe, it, expect } from "vitest"
import { resolveRegistryTree } from "../../src/utils/dependency-resolver.js"
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
