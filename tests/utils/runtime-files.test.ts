import { describe, expect, it } from "vitest"
import {
  filterFilesForRuntime,
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
