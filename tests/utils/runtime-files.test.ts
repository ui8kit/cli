import { describe, expect, it } from "vitest"
import {
  extractRelativeImports,
  isKnownRuntime,
  filterFilesForRuntime,
  isTypeFile,
  resolveImportKey,
  isSharedRuntimeFile,
  matchesRuntimeFile,
} from "../../src/utils/runtime-files.js"

const buttonFiles = [
  { path: "ui/button/button.tsx", target: "components/ui/button/button.tsx" },
  { path: "ui/button/button.solid.tsx", target: "components/ui/button/button.solid.tsx" },
  { path: "ui/button/Button.svelte", target: "components/ui/button/Button.svelte" },
  { path: "ui/button/Button.vue", target: "components/ui/button/Button.vue" },
  { path: "ui/button/button.templ", target: "components/ui/button/button.templ" },
  { path: "ui/button/button_templ.go", target: "components/ui/button/button_templ.go" },
  { path: "ui/button/button_gen.go", target: "components/ui/button/button_gen.go" },
  { path: "ui/button/Button.latte", target: "components/ui/button/Button.latte" },
  { path: "ui/button/Button.html.twig", target: "components/ui/button/Button.html.twig" },
  { path: "ui/button/button.shared.ts", target: "components/ui/button/button.shared.ts" },
  {
    path: "ui/button/button.variants.json",
    target: "components/ui/button/button.variants.json",
  },
]

describe("runtime file filter", () => {
  it("detects shared assets", () => {
    expect(isSharedRuntimeFile("button.shared.ts")).toBe(true)
    expect(isSharedRuntimeFile("button.variants.json")).toBe(true)
    expect(isSharedRuntimeFile("Button.svelte")).toBe(false)
  })

  it("matches react without solid", () => {
    expect(matchesRuntimeFile("button.tsx", "react")).toBe(true)
    expect(matchesRuntimeFile("button.solid.tsx", "react")).toBe(false)
    expect(matchesRuntimeFile("button.solid.tsx", "solid")).toBe(true)
  })

  it("returns all files when runtime is unset", () => {
    expect(filterFilesForRuntime(buttonFiles, undefined)).toHaveLength(buttonFiles.length)
  })

  it("keeps shared + svelte files for svelte", () => {
    const filtered = filterFilesForRuntime(buttonFiles, "svelte")
    const names = filtered.map((f) => f.target!.split("/").pop())
    expect(names).toEqual(
      expect.arrayContaining(["Button.svelte", "button.shared.ts", "button.variants.json"]),
    )
    expect(names).not.toContain("button.tsx")
    expect(names).not.toContain("Button.vue")
    expect(filtered).toHaveLength(3)
  })

  it("keeps templ + go companions", () => {
    const filtered = filterFilesForRuntime(buttonFiles, "templ")
    const names = filtered.map((f) => f.target!.split("/").pop()).sort()
    expect(names).toEqual([
      "button.shared.ts",
      "button.templ",
      "button.variants.json",
      "button_gen.go",
      "button_templ.go",
    ])
  })

  it("does not slice utils items", () => {
    const utilsFiles = [
      { path: "utils/cn.ts", target: "utils/cn.ts" },
      { path: "utils/expr.ts", target: "utils/expr.ts" },
    ]
    expect(
      filterFilesForRuntime(utilsFiles, "svelte", { componentType: "registry:utils" }),
    ).toHaveLength(2)
  })
})

describe("runtime file filter: type files and imported files (gap 1)", () => {
  const f = (target: string, content = "") => ({ path: target, target, content })

  it("isTypeFile recognises *.types.ts, *.types.tsx and *.d.ts", () => {
    expect(isTypeFile("blocks/hero.types.ts")).toBe(true)
    expect(isTypeFile("blocks/hero.types.tsx")).toBe(true)
    expect(isTypeFile("global.d.ts")).toBe(true)
    expect(isTypeFile("blocks/hero.ts")).toBe(false)
    expect(isTypeFile("blocks/types.svelte")).toBe(false)
  })

  it("keeps *.types.ts for every runtime", () => {
    const files = [f("blocks/hero.svelte"), f("blocks/hero.tsx"), f("blocks/hero.types.ts")]
    for (const rt of ["svelte", "react", "vue", "solid", "templ"]) {
      expect(filterFilesForRuntime(files, rt).map((x) => x.target)).toContain("blocks/hero.types.ts")
    }
  })

  it("keeps a non-runtime file that a kept file imports", () => {
    const files = [
      f("ui/icon.svelte", `<script>import { icons } from "./icons"</script>`),
      f("ui/icons.ts", "export const icons = {}"),
      f("ui/unrelated.ts", "export {}"),
    ]
    const names = filterFilesForRuntime(files, "svelte").map((x) => x.target)
    expect(names).toEqual(["ui/icon.svelte", "ui/icons.ts"])
  })

  it("follows imports transitively (kept -> helper -> helper)", () => {
    const files = [
      f("a/view.tsx", `import { x } from "./x"`),
      f("a/x.ts", `export * from "./y"`),
      f("a/y.ts", "export const y = 1"),
      f("a/z.ts", "export const z = 1"),
    ]
    expect(filterFilesForRuntime(files, "react").map((x) => x.target)).toEqual(["a/view.tsx", "a/x.ts", "a/y.ts"])
  })

  it("never drops a file another selected file imports (even another runtime's file)", () => {
    const files = [
      f("a/view.tsx", `import Shared from "./shared.svelte"`),
      f("a/shared.svelte", ""),
    ]
    expect(filterFilesForRuntime(files, "react")).toHaveLength(2)
  })

  it("resolves directory index imports and TS-style .js specifiers", () => {
    const files = [
      f("a/view.vue", `import "./lib"\nimport { q } from "./q.js"`),
      f("a/lib/index.ts", ""),
      f("a/q.ts", ""),
    ]
    expect(filterFilesForRuntime(files, "vue")).toHaveLength(3)
  })

  it("does not follow package or alias imports", () => {
    const files = [f("a/view.tsx", `import x from "react"\nimport y from "@/utils/cn"`), f("a/react.ts", "")]
    expect(filterFilesForRuntime(files, "react").map((x) => x.target)).toEqual(["a/view.tsx"])
  })

  it("works with path-only files (no target)", () => {
    const files = [
      { path: "a/view.svelte", content: `import type { T } from "./view.types"` },
      { path: "a/view.types.ts", content: "" },
    ]
    expect(filterFilesForRuntime(files, "svelte")).toHaveLength(2)
  })

  it("extractRelativeImports tags type-only statements", () => {
    const refs = extractRelativeImports(`
      import type { A } from "./a"
      import { type B, type C } from "./b"
      import { type D, e } from "./c"
      import F from "./d"
      export type { G } from "./g"
      import "./side"
      // import H from "./commented"
      import pkg from "pkg"
    `)
    expect(refs).toEqual([
      { specifier: "./a", typeOnly: true },
      { specifier: "./b", typeOnly: true },
      { specifier: "./c", typeOnly: false },
      { specifier: "./d", typeOnly: false },
      { specifier: "./g", typeOnly: true },
      { specifier: "./side", typeOnly: false },
    ])
  })

  it("resolveImportKey tries extensions and index files", () => {
    const known = new Set(["a/b.ts", "a/c/index.ts", "a/d.svelte"])
    expect(resolveImportKey("a/x.tsx", "./b", known)).toBe("a/b.ts")
    expect(resolveImportKey("a/x.tsx", "./c", known)).toBe("a/c/index.ts")
    expect(resolveImportKey("a/sub/x.tsx", "../d.svelte", known)).toBe("a/d.svelte")
    expect(resolveImportKey("a/x.tsx", "./nope", known)).toBeUndefined()
  })
})

describe("jinja2 runtime", () => {
  it("is a known runtime", () => {
    expect(isKnownRuntime("jinja2")).toBe(true)
    expect(isKnownRuntime("templ")).toBe(true)
    expect(isKnownRuntime("html")).toBe(false)
  })

  it("matches .html.j2 / .j2 / .jinja / .jinja2 templates only", () => {
    expect(matchesRuntimeFile("ui/button/button.html.j2", "jinja2")).toBe(true)
    expect(matchesRuntimeFile("blocks/hero.j2", "jinja2")).toBe(true)
    expect(matchesRuntimeFile("x.jinja", "jinja2")).toBe(true)
    expect(matchesRuntimeFile("x.jinja2", "jinja2")).toBe(true)
    expect(matchesRuntimeFile("ui/button/button.html.twig", "jinja2")).toBe(false)
    expect(matchesRuntimeFile("py/ui8kit_jinja/runtime.py", "jinja2")).toBe(false)
  })

  it("keeps jinja2 templates and shared variants of a multi-stack item", () => {
    const files = [
      { path: "ui/button/button.html.j2", target: "ui/button/button.html.j2" },
      { path: "ui/button/button.html.twig", target: "ui/button/button.html.twig" },
      { path: "ui/button/button.variants.json", target: "ui/button/button.variants.json" },
    ]
    expect(filterFilesForRuntime(files, "jinja2").map((f) => f.target)).toEqual([
      "ui/button/button.html.j2",
      "ui/button/button.variants.json",
    ])
  })
})

describe("single-runtime items (item-level runtime equals the requested runtime)", () => {
  it("solid: keeps plain *.tsx files of an item published for solid", () => {
    const files = [
      { path: "blocks/hero.tsx", target: "blocks/hero.tsx" },
      { path: "blocks/hero.types.ts", target: "blocks/hero.types.ts" },
    ]
    expect(filterFilesForRuntime(files, "solid")).toHaveLength(1) // multi-stack rule: only *.solid.tsx (+ types)
    expect(filterFilesForRuntime(files, "solid", { itemRuntime: "solid" })).toHaveLength(2)
  })

  it("templ: keeps Go companions that are not *_gen.go (embed.go, go.mod)", () => {
    const files = [
      { path: "blocks/embed.go", target: "blocks/embed.go" },
      { path: "blocks/recipes/avatar.variants.json", target: "blocks/recipes/avatar.variants.json" },
    ]
    expect(filterFilesForRuntime(files, "templ", { itemRuntime: "templ" })).toHaveLength(2)
  })

  it("a different item runtime still uses the file rules", () => {
    const files = [
      { path: "blocks/hero.tsx", target: "blocks/hero.tsx" },
      { path: "blocks/Hero.svelte", target: "blocks/Hero.svelte" },
    ]
    expect(filterFilesForRuntime(files, "svelte", { itemRuntime: "react" }).map((f) => f.target)).toEqual([
      "blocks/Hero.svelte",
    ])
  })
})
