// Per-runtime registries (r/<runtime>/, item-level `runtime`): `add --runtime <rt>` must write every file of an item
// published for that runtime, whatever its extension. Regression: Solid items (*.tsx) and templ companions
// (blocks/embed.go) were dropped by the multi-stack file rules; jinja2 items were rejected by the item schema.
import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
// @ts-expect-error plain .mjs helpers
import { serveDir } from "../helpers/static-server.mjs"
import { addCommand } from "../../src/commands/add.js"
import { resetCache } from "../../src/registry/api.js"

type Spec = { name: string; type: string; deps: string[]; files: string[] }
const FOLDER: Record<string, string> = {
  "registry:ui": "components/ui",
  "registry:component": "components",
  "registry:block": "blocks",
  "registry:utils": "utils",
  "registry:lib": "lib",
}
const REGISTRIES: Record<string, Spec[]> = {
  solid: [
    { name: "utils", type: "registry:utils", deps: [], files: ["utils/cn.ts"] },
    { name: "button", type: "registry:ui", deps: ["utils"], files: ["primitives/button/button.tsx"] },
    { name: "hero", type: "registry:block", deps: ["button", "utils"], files: ["blocks/hero.tsx", "blocks/hero.types.ts"] },
  ],
  templ: [
    { name: "utils", type: "registry:utils", deps: [], files: ["utils/utils.go", "go.mod"] },
    { name: "presets", type: "registry:lib", deps: [], files: ["blocks/embed.go", "blocks/presets/defaults.json", "blocks/recipes/avatar.variants.json"] },
    { name: "button", type: "registry:ui", deps: ["utils"], files: ["ui/button/button.templ", "ui/button/button_gen.go", "ui/button/button.variants.json"] },
    { name: "hero", type: "registry:block", deps: ["button", "presets", "utils"], files: ["blocks/hero.templ"] },
  ],
  jinja2: [
    { name: "utils", type: "registry:utils", deps: [], files: ["py/ui8kit_jinja/runtime.py", "requirements.txt"] },
    { name: "button", type: "registry:ui", deps: ["utils"], files: ["ui/button/button.html.j2", "ui/button/button.variants.json"] },
    { name: "hero", type: "registry:block", deps: ["button", "utils"], files: ["blocks/hero.html.j2"] },
  ],
}

let registryDir = ""
let server: { url: string; close: () => Promise<void> }
const originalCwd = process.cwd()
const originalHome = process.env.HOME

beforeAll(async () => {
  registryDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-single-reg-"))
  for (const [rt, specs] of Object.entries(REGISTRIES)) {
    for (const s of specs) {
      const item = {
        name: s.name, type: s.type, title: s.name, description: `Synthetic ${s.name}`, runtime: rt,
        dependencies: [], devDependencies: [], registryDependencies: s.deps,
        files: s.files.map((f) => ({ path: f, target: f, content: `// ${rt} ${f}\n` })),
      }
      const file = path.join(registryDir, rt, FOLDER[s.type]!, `${s.name}.json`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(item))
    }
    const index = { components: specs.map((s) => ({ name: s.name, type: s.type, registryDependencies: s.deps })) }
    fs.writeFileSync(path.join(registryDir, rt, "index.json"), JSON.stringify(index))
  }
  server = await serveDir(registryDir)
})
afterAll(async () => {
  await server.close()
  fs.rmSync(registryDir, { recursive: true, force: true })
})

let project = ""
beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-single-"))
  process.env.HOME = project
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "p", private: true }))
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

describe.each(Object.keys(REGISTRIES))("add from a single-runtime registry (%s)", (rt) => {
  it("installs every file of the item and of its registry dependencies", async () => {
    fs.writeFileSync(
      path.join(project, "ui8kit.config.json"),
      JSON.stringify({
        contractVersion: "2.0.0", framework: rt, runtime: rt, dir: "src", aliases: {}, registry: "@ui8kit",
        registryUrl: `${server.url}/${rt}`, strictCdn: true,
      }),
    )
    await addCommand(["hero"], { force: true, runtime: rt, cache: false })
    const expected = REGISTRIES[rt]!.flatMap((s) => s.files)
    for (const f of expected) expect(fs.existsSync(path.join(project, "src", f)), `src/${f}`).toBe(true)
  })
})
