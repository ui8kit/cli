import { describe, it, expect } from "vitest"
import {
  parseArgs,
  buildTargetUrls,
  extractCdnBaseUrls,
  normalizeRelativePath,
  normalizeBaseUrl
} from "../../scripts/get-cdn.js"

describe("get-cdn utilities", () => {
  it("extracts cdnBaseUrls from source config text", () => {
    const content = `
      export const SCHEMA_CONFIG = {
        cdnBaseUrls: [
          "https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r",
          'https://unpkg.com/@ui8kit/registry@latest/r',
          "https://raw.githubusercontent.com/buildy-ui/ui/main/packages/@ui8kit/registry/r",
        ],
      }
    `

    expect(extractCdnBaseUrls(content)).toEqual([
      "https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r",
      "https://unpkg.com/@ui8kit/registry@latest/r",
      "https://raw.githubusercontent.com/buildy-ui/ui/main/packages/@ui8kit/registry/r"
    ])
  })

  it("normalizes relative paths by stripping leading slash and r prefix", () => {
    expect(normalizeRelativePath("/components/variants/index.json")).toBe("components/variants/index.json")
    expect(normalizeRelativePath("r/components/ui/Button.json")).toBe("components/ui/Button.json")
    expect(normalizeRelativePath("components/Button.json")).toBe("components/Button.json")
  })

  it("normalizes target URLs so /r is not duplicated", () => {
    const targets = buildTargetUrls(
      [
        "https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r",
        "https://unpkg.com/@ui8kit/registry@latest/r/",
        "https://cdn.example.com/registry"
      ],
      ["r/components/variants/index.json", "/components/ui/Button.json"]
    )
    const urls = targets.map(item => item.target)

    expect(urls).toEqual([
      "https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r/components/variants/index.json",
      "https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r/components/ui/Button.json",
      "https://unpkg.com/@ui8kit/registry@latest/r/components/variants/index.json",
      "https://unpkg.com/@ui8kit/registry@latest/r/components/ui/Button.json",
      "https://cdn.example.com/registry/r/components/variants/index.json",
      "https://cdn.example.com/registry/r/components/ui/Button.json"
    ])
  })

  it("parses CLI args for suffixes and extra URLs", () => {
    const parsed = parseArgs(["-p", "/components/variants/index.json", "--url", "https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r", "src/utils/schema-config.ts"])

    expect(parsed.suffixes).toContain("components/variants/index.json")
    expect(parsed.extraUrls).toContain("https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r")
    expect(parsed.configFiles).toContain("src/utils/schema-config.ts")
  })

  it("normalizes trailing slashes in base URLs", () => {
    expect(normalizeBaseUrl("https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r////")).toBe("https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r")
  })
})
