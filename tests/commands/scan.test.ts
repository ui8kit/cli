import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { scanCommand } from "../../src/commands/scan.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-scan-test-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

describe("scan command", () => {
  let fixture = ""
  const originalCwd = process.cwd()

  beforeEach(async () => {
    fixture = tempDir()
    await fs.ensureDir(fixture)
    process.chdir(fixture)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await fs.remove(fixture)
  })

  it("creates registry file from component sources", async () => {
    await fs.ensureDir(path.join(fixture, "src", "components", "ui"))
    await fs.writeFile(
      path.join(fixture, "src", "components", "ui", "button.tsx"),
      "export const Button = () => null\n"
    )
    await fs.writeFile(
      path.join(fixture, "src", "components", "_private.tsx"),
      "export const Private = 1\n"
    )

    const outputPath = path.join(fixture, "src", "registry.json")
    await scanCommand({ cwd: fixture, output: outputPath, source: path.join(fixture, "src") })

    const registry = await fs.readJson(outputPath)
    expect(Array.isArray(registry.items)).toBe(true)
    expect(registry.items.some((item: any) => item.name === "button" && item.type === "registry:ui")).toBe(true)
  })

  it("includes variants index when it exports via re-export syntax", async () => {
    await fs.ensureDir(path.join(fixture, "src", "variants"))
    await fs.writeFile(
      path.join(fixture, "src", "variants", "index.ts"),
      "export * from \"./button\"\n"
    )

    const outputPath = path.join(fixture, "src", "registry.json")
    await scanCommand({ cwd: fixture, output: outputPath, source: path.join(fixture, "src") })

    const registry = await fs.readJson(outputPath)
    expect(registry.items.some((item: any) => item.name === "index" && item.type === "registry:variants")).toBe(true)
  })

  it("keeps distinct index entries for components and variants by type", async () => {
    await fs.ensureDir(path.join(fixture, "src", "components"))
    await fs.ensureDir(path.join(fixture, "src", "components", "ui"))
    await fs.ensureDir(path.join(fixture, "src", "variants"))

    await fs.writeFile(
      path.join(fixture, "src", "components", "index.ts"),
      "export { default } from \"./layout\"\n"
    )
    await fs.writeFile(
      path.join(fixture, "src", "components", "ui", "layout.tsx"),
      "export default function Layout() { return null }\n"
    )
    await fs.writeFile(
      path.join(fixture, "src", "variants", "index.ts"),
      "export * from \"./button\"\n"
    )

    const outputPath = path.join(fixture, "src", "registry.json")
    await scanCommand({ cwd: fixture, output: outputPath, source: path.join(fixture, "src") })

    const registry = await fs.readJson(outputPath)
    expect(registry.items.some((item: any) => item.name === "index" && item.type === "registry:composite")).toBe(true)
    expect(registry.items.some((item: any) => item.name === "index" && item.type === "registry:variants")).toBe(true)
  })
})
