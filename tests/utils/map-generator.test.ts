import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { generateMap, parseUtilityMapSource, normalizeUtilityMap } from "../../src/utils/map-generator.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-map-generator-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

describe("map generator", () => {
  let fixture = ""

  beforeEach(() => {
    fixture = tempDir()
    fs.ensureDirSync(fixture)
  })

  afterEach(async () => {
    await fs.remove(fixture)
  })

  it("normalizes map keys and values deterministically", () => {
    const source = `
      export const utilityMap = {
        spacing: ['m-4', 'm-2', 'm-4'],
        display: ['flex', 'block']
      } as const
    `
    const parsed = parseUtilityMapSource(source)
    const normalized = normalizeUtilityMap(parsed)

    expect(Object.keys(normalized)).toEqual(["display", "spacing"])
    expect(normalized.display).toEqual(["block", "flex"])
    expect(normalized.spacing).toEqual(["m-2", "m-4"])
  })

  it("generates ui8kit map JSON from source file", async () => {
    const sourcePath = path.join(fixture, "src", "lib", "utility-props.map.ts")
    const outputPath = path.join(fixture, "packages", "registry", "ui8kit.map.json")
    await fs.ensureDir(path.dirname(sourcePath))

    await fs.writeFile(
      sourcePath,
      `
      export default {
        spacing: ['m-4', 'm-2', 'm-4'],
        display: ['flex', 'block'],
        bg: ['accent', 'accent-foreground']
      }
      `
    )

    const result = await generateMap({ sourcePath, outputPath, skipMissing: false })

    expect(result.generated).toBe(true)
    const payload = await fs.readJson(outputPath)
    expect(payload.version).toBe("1.0.0")
    expect(payload.map).toEqual([
      "bg-accent",
      "bg-accent-foreground",
      "display-block",
      "display-flex",
      "m-2",
      "m-4"
    ])
    expect(payload.generatedAt).toBeTruthy()
  })

  it("emits runtime-aware classes from utility-props.ts", async () => {
    const sourcePath = path.join(fixture, "src", "lib", "utility-props.map.ts")
    const runtimeSourcePath = path.join(fixture, "src", "lib", "utility-props.ts")
    const outputPath = path.join(fixture, "packages", "registry", "ui8kit.map.json")
    await fs.ensureDir(path.dirname(sourcePath))

    await fs.writeFile(
      sourcePath,
      `
      export default {
        flex: ['col', 'row'],
        gap: ['md', 'xs'],
        bg: ['accent']
      }
      `
    )

    await fs.writeFile(
      runtimeSourcePath,
      `
      const FLEX_DIR_VALUES = ['col', 'row', 'col-reverse', 'row-reverse'] as const;
      const GAP_SEMANTIC: Record<string, string> = {
        xs: "1",
        md: "4",
        lg: "6",
      };
      `
    )

    const result = await generateMap({
      sourcePath,
      runtimeSourcePath,
      outputPath,
      skipMissing: false
    })

    expect(result.generated).toBe(true)
    const payload = await fs.readJson(outputPath)
    expect(payload.map).toEqual([
      "bg-accent",
      "flex",
      "flex-col",
      "flex-row",
      "gap-1",
      "gap-4"
    ])
  })

  it("emits bare utility token classes for empty values", async () => {
    const sourcePath = path.join(fixture, "src", "lib", "utility-props.map.ts")
    const outputPath = path.join(fixture, "packages", "registry", "ui8kit.map.json")
    await fs.ensureDir(path.dirname(sourcePath))

    await fs.writeFile(
      sourcePath,
      `
      export default {
        display: ['', 'flex'],
      }
      `
    )

    const result = await generateMap({ sourcePath, outputPath, skipMissing: false })
    expect(result.generated).toBe(true)
    const payload = await fs.readJson(outputPath)
    expect(payload.map).toEqual(["display", "display-flex"])
  })

  it("throws when source map has invalid shape", async () => {
    const sourcePath = path.join(fixture, "src", "lib", "utility-props.map.ts")
    await fs.ensureDir(path.dirname(sourcePath))
    await fs.writeFile(sourcePath, `export const utilityMap = { spacing: "m-2" }`)

    await expect(generateMap({ sourcePath, outputPath: path.join(fixture, "packages", "registry", "ui8kit.map.json"), skipMissing: false }))
      .rejects
      .toThrow("Utility \"spacing\" expects string[]")
  })

  it("skips missing source map when skipMissing is enabled", async () => {
    const result = await generateMap({ sourcePath: path.join(fixture, "missing.ts"), outputPath: path.join(fixture, "packages", "registry", "ui8kit.map.json"), skipMissing: true })
    expect(result.generated).toBe(false)
  })
})

