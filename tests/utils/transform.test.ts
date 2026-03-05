import { describe, it, expect } from "vitest"
import { SCHEMA_CONFIG } from "../../src/utils/schema-config.js"
import { transformImports, transformCleanup, applyTransforms, shouldTransformFile } from "../../src/utils/transform.js"

describe("transform utility", () => {
  it("keeps default aliases unchanged", () => {
    const input = `import { cn } from "@/lib/utils";`
    const output = transformImports(input, SCHEMA_CONFIG.defaultAliases)
    expect(output).toBe(input)
  })

  it("rewrites alias path with custom aliases", () => {
    const input = `import { cn } from "@/components/ui/button";`
    const output = transformImports(input, { ...SCHEMA_CONFIG.defaultAliases, "@/components": "@/ui" })
    expect(output).toContain(`@/ui/button`)
  })

  it("leaves non-alias imports unchanged", () => {
    const input = `import React from "react";`
    const output = transformImports(input, SCHEMA_CONFIG.defaultAliases)
    expect(output).toBe(input)
  })

  it("normalizes cleanup output", () => {
    const input = "line1\r\n\r\n\r\nline2\n"
    const output = transformCleanup(input)
    expect(output).toBe("line1\n\nline2\n")
  })

  it("handles applyTransforms end-to-end", () => {
    const input = `import { cn } from "@/components/ui/button"\r\nexport const x = 1;\r\n`
    const output = applyTransforms(input, { ...SCHEMA_CONFIG.defaultAliases, "@/components": "@/ui" })
    expect(output).toContain(`@/ui/button`)
  })

  it("detects transformable files", () => {
    expect(shouldTransformFile("button.ts")).toBe(true)
    expect(shouldTransformFile("button.tsx")).toBe(true)
    expect(shouldTransformFile("button.css")).toBe(false)
  })
})
