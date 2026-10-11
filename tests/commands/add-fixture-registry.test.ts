import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
// @ts-expect-error plain .mjs helpers
import { buildFixtureRegistry } from "../fixtures/build-fixture-registry.mjs"
// @ts-expect-error plain .mjs helpers
import { serveDir } from "../helpers/static-server.mjs"
// @ts-expect-error plain .mjs helpers
import { findUnresolvedImports } from "../helpers/check-imports.mjs"
import { addCommand } from "../../src/commands/add.js"
import { resetCache } from "../../src/registry/api.js"
import { logger } from "../../src/utils/logger.js"

let registryDir = ""
let server: { url: string; close: () => Promise<void> }
const originalCwd = process.cwd()
const originalHome = process.env.HOME

beforeAll(async () => {
  registryDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-addfx-reg-"))
  buildFixtureRegistry(registryDir)
  server = await serveDir(registryDir)
})
afterAll(async () => {
  await server.close()
  fs.rmSync(registryDir, { recursive: true, force: true })
})

let project = ""
beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-addfx-"))
  process.env.HOME = project // isolates ~/.ui8kit/cache
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "p", private: true }))
  process.chdir(project)
  vi.spyOn(console, "log").mockImplementation(() => {})
})
afterEach(() => {
  process.chdir(originalCwd)
  process.env.HOME = originalHome
  resetCache()
  logger.setVerbose(false)
  vi.restoreAllMocks()
  fs.rmSync(project, { recursive: true, force: true })
})

function writeConfig(rt: string, extra: Record<string, unknown> = {}) {
  fs.writeFileSync(
    path.join(project, "ui8kit.config.json"),
    JSON.stringify({
      contractVersion: "2.0.0",
      framework: rt,
      runtime: rt,
      dir: "src",
      aliases: {},
      registry: "@ui8kit",
      registryUrl: `${server.url}/${rt}`,
      strictCdn: true,
      ...extra,
    }),
  )
}
const has = (rel: string) => fs.existsSync(path.join(project, rel))
const output = () => (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c.join(" ")).join("\n")

describe.each(["svelte", "react"])("add against the fixture registry (%s)", (rt) => {
  const ext = rt === "react" ? "tsx" : "svelte"

  it("gap 1: --runtime keeps *.types.ts and imported helpers; 0 unresolved imports", async () => {
    writeConfig(rt)
    await addCommand(["button", "card", "hero-split"], { force: true, runtime: rt, cache: false })
    expect(has("src/blocks/hero-split.types.ts")).toBe(true)
    expect(has("src/blocks/feature-grid.types.ts")).toBe(true)
    expect(has("src/primitives/button/button.helpers.ts")).toBe(true)
    expect(has(`src/blocks/hero-split.${ext}`)).toBe(true)
    expect(findUnresolvedImports(path.join(project, "src")).bad).toEqual([])
  })

  it("gap 2: utils and lib/presets are installed on add when missing, without a warning", async () => {
    writeConfig(rt)
    const warn = vi.spyOn(logger, "warn")
    await addCommand(["feature-grid"], { runtime: rt, cache: false })
    expect(has("src/utils/cn.ts")).toBe(true)
    expect(has("src/presets/defaults.ts")).toBe(true)
    expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => /not found/.test(m))).toEqual([])
  })

  it("gap 2: existing utils are kept when pulled in as a dependency, even with --force", async () => {
    writeConfig(rt)
    fs.mkdirSync(path.join(project, "src/utils"), { recursive: true })
    fs.writeFileSync(path.join(project, "src/utils/cn.ts"), "// user edit\n")
    await addCommand(["card"], { force: true, runtime: rt, cache: false })
    expect(fs.readFileSync(path.join(project, "src/utils/cn.ts"), "utf8")).toBe("// user edit\n")
    expect(has("src/utils/index.ts")).toBe(true) // missing sibling still installed
  })

  it("gap 2: `add utils` works as an explicit item (force overwrites)", async () => {
    writeConfig(rt)
    fs.mkdirSync(path.join(project, "src/utils"), { recursive: true })
    fs.writeFileSync(path.join(project, "src/utils/cn.ts"), "// user edit\n")
    await addCommand(["utils"], { force: true, runtime: rt, cache: false })
    expect(fs.readFileSync(path.join(project, "src/utils/cn.ts"), "utf8")).toMatch(/export const cn/)
  })

  it("gap 3: config.paths and --path flag, with registry targets", async () => {
    writeConfig(rt, { paths: { ui: "kit" } })
    await addCommand(["card", "badge"], { force: true, runtime: rt, cache: false })
    expect(has(`src/kit/card/card.${ext}`)).toBe(true)
    expect(has(`src/kit/badge/badge.${ext}`)).toBe(true)
    await addCommand(["card"], { force: true, runtime: rt, cache: false, path: ["ui=flagged"] })
    expect(has(`src/flagged/card/card.${ext}`)).toBe(true)
  })

  it("gap 3: without paths the file target is used", async () => {
    writeConfig(rt)
    await addCommand(["card", "badge"], { force: true, runtime: rt, cache: false })
    expect(has(`src/primitives/card/card.${ext}`)).toBe(true)
    expect(has(`src/components/ui/badge/badge.${ext}`)).toBe(true)
  })

  it("gap 4: type-only cycles are quiet; each item is installed once; --verbose lists edges", async () => {
    writeConfig(rt)
    const warn = vi.spyOn(logger, "warn")
    await addCommand(["feature-grid", "section-frame"], { force: true, runtime: rt, cache: false })
    expect(warn).not.toHaveBeenCalled()
    const installed = [...output().matchAll(/^- \[\d+\/\d+\] Installing ([\w-]+) from/gm)].map((m) => m[1])
    expect(new Set(installed).size).toBe(installed.length)
    expect(output()).not.toMatch(/cycle|circular/i)

    logger.setVerbose(true)
    ;(console.log as unknown as ReturnType<typeof vi.fn>).mockClear()
    await addCommand(["feature-grid"], { force: true, runtime: rt, cache: false })
    expect(output()).toMatch(/type-only dependency edge: feature-cards -> feature-grid/)
  })

  it("add --all: 0 failed, 0 unresolved imports", async () => {
    writeConfig(rt)
    const warn = vi.spyOn(logger, "warn")
    await addCommand([], { all: true, force: true, runtime: rt, cache: false })
    expect(output()).toMatch(/Failed: 0/)
    expect(warn).not.toHaveBeenCalled()
    expect(findUnresolvedImports(path.join(project, "src")).bad).toEqual([])
  })
})
