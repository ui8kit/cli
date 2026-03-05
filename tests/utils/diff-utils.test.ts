import { describe, it, expect } from "vitest"
import { buildUnifiedDiff, hasDiff, formatDiffPreview } from "../../src/utils/diff-utils.js"

describe("diff utils", () => {
  it("detects same content", () => {
    expect(hasDiff("same\nline", "same\nline")).toBe(false)
  })

  it("detects changed content", () => {
    expect(hasDiff("one", "two")).toBe(true)
  })

  it("builds unified diff", () => {
    const diff = buildUnifiedDiff("a.tsx", "b.tsx", "const a = 1;\n", "const a = 2;\n")
    expect(diff).toContain("--- a.tsx")
    expect(diff).toContain("+++ b.tsx")
    expect(diff).toContain("-const a = 1;")
    expect(diff).toContain("+const a = 2;")
  })

  it("truncates diff preview at max lines", () => {
    const source = Array.from({ length: 200 }, (_, index) => `line-${index}`).join("\n")
    const target = Array.from({ length: 200 }, (_, index) => `line-${index + 1}`).join("\n")
    const diff = buildUnifiedDiff("old.tsx", "new.tsx", source, target)
    const preview = formatDiffPreview(diff, 3)
    expect(preview.endsWith("\n...")).toBe(true)
  })
})
