// Brand registry block → URL dependency on a primitive in another registry →
// the primitive's bare-name deps (utils) resolve against the primitive registry.
import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
// @ts-expect-error plain .mjs helpers
import { serveDir } from "../helpers/static-server.mjs"
import { addCommand } from "../../src/commands/add.js"
import { resetCache } from "../../src/registry/api.js"
import { registryBaseFromUrl } from "../../src/utils/dependency-resolver.js"

type Server = { url: string; close: () => Promise<void> }
let primitivesDir = ""
let brandDir = ""
let primitives: Server
let brand: Server
let project = ""
const originalCwd = process.cwd()
const originalHome = process.env.HOME

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data))
}
const item = (name: string, type: string, deps: string[], files: Array<[string, string]>) => ({
  name,
  type,
  runtime: "react",
  dependencies: [],
  devDependencies: [],
  registryDependencies: deps,
  files: files.map(([target, content]) => ({ path: target, target, content })),
})

beforeAll(async () => {
  primitivesDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-prim-"))
  brandDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-brand-"))
  // primitive registry (per-runtime layout): r/react/{index.json, components/ui/button.json, utils/utils.json}
  const p = path.join(primitivesDir, "r", "react")
  writeJson(path.join(p, "index.json"), {
    components: [
      { name: "utils", type: "registry:utils" },
      { name: "button", type: "registry:ui", registryDependencies: ["utils"] },
    ],
  })
  writeJson(path.join(p, "utils", "utils.json"), item("utils", "registry:utils", [], [["utils/cn.ts", "export const cn = 'primitive'\n"]]))
  writeJson(
    path.join(p, "components", "ui", "button.json"),
    item("button", "registry:ui", ["utils"], [["ui/button/button.tsx", "import { cn } from '../../utils/cn'\nexport const Button = cn\n"]]),
  )
  primitives = await serveDir(primitivesDir)

  const buttonUrl = `${primitives.url}/r/react/components/ui/button.json`
  // brand registry: its own `utils` (must NOT be used for the primitive) + a block depending on the URL
  writeJson(path.join(brandDir, "r", "index.json"), {
    components: [
      { name: "utils", type: "registry:utils" },
      { name: "hero", type: "registry:block", registryDependencies: [buttonUrl] },
    ],
  })
  writeJson(path.join(brandDir, "r", "utils", "utils.json"), item("utils", "registry:utils", [], [["utils/brand.ts", "export const brand = 1\n"]]))
  writeJson(
    path.join(brandDir, "r", "blocks", "hero.json"),
    item("hero", "registry:block", [buttonUrl], [["blocks/hero.tsx", "import { Button } from '../ui/button/button'\nexport const Hero = Button\n"]]),
  )
  brand = await serveDir(brandDir)
})
afterAll(async () => {
  await primitives.close()
  await brand.close()
  fs.rmSync(primitivesDir, { recursive: true, force: true })
  fs.rmSync(brandDir, { recursive: true, force: true })
})

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-urldeps-"))
  process.env.HOME = project
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "p", private: true }))
  fs.writeFileSync(
    path.join(project, "ui8kit.config.json"),
    JSON.stringify({ framework: "react", runtime: "react", dir: "src", aliases: {}, registry: "@ui8kit", registryUrl: `${brand.url}/r`, strictCdn: true }),
  )
  process.chdir(project)
  vi.spyOn(console, "log").mockImplementation(() => {})
})
afterEach(() => {
  process.chdir(originalCwd)
  process.env.HOME = originalHome
  resetCache()
  vi.restoreAllMocks()
  fs.rmSync(project, { recursive: true, force: true })
})

describe("URL registryDependencies", () => {
  it("derives the registry base from an item URL", () => {
    expect(registryBaseFromUrl("https://cdn.jsdelivr.net/npm/@ui8kit/registry@3.0.0/r/react/components/ui/button.json")).toBe(
      "https://cdn.jsdelivr.net/npm/@ui8kit/registry@3.0.0/r/react",
    )
    expect(registryBaseFromUrl("https://x.dev/r/utils/utils.json?v=1")).toBe("https://x.dev/r")
  })

  it("installs brand block + URL primitive + the primitive registry's utils (not the brand's)", async () => {
    await addCommand(["hero"], { registry: "ui" })
    const at = (rel: string) => path.resolve(project, rel)
    expect(fs.existsSync(at("src/blocks/hero.tsx"))).toBe(true)
    expect(fs.existsSync(at("src/ui/button/button.tsx"))).toBe(true)
    expect(fs.readFileSync(at("src/utils/cn.ts"), "utf-8")).toContain("primitive")
    expect(fs.existsSync(at("src/utils/brand.ts"))).toBe(false)
  })
})
