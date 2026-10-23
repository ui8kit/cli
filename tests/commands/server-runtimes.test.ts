// Server runtimes (templ/latte/twig/jinja2) as first-class: Go import rewrite, toolchain hints from meta,
// no npm / package.json, lock + check.
import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
// @ts-expect-error plain .mjs helpers
import { serveDir } from "../helpers/static-server.mjs"

const installDependencies = vi.fn(async () => {})
vi.mock("../../src/utils/package-manager.js", () => ({ installDependencies }))

const { addCommand } = await import("../../src/commands/add.js")
const { initCommand } = await import("../../src/commands/init.js")
const { runCheck } = await import("../../src/commands/check.js")
const { resetCache } = await import("../../src/registry/api.js")
const { logger } = await import("../../src/utils/logger.js")

const GEN = "github.com/ui8kit/codegen/generated/templ/utils"
const META: Record<string, Record<string, unknown>> = {
  templ: { go: { importPath: GEN, require: ["github.com/a-h/templ@v0.3.1070"] } },
  twig: { composer: { require: { php: ">=8.1", "twig/twig": "^3.0" }, autoload: { "psr-4": { "UI8Kit\\Twig\\": "<dir>/runtime/" } } } },
  latte: { composer: { require: { php: ">=8.1", "latte/latte": "^3.0" }, autoload: { "psr-4": { "UI8Kit\\Latte\\": "<dir>/runtime/" } } } },
  jinja2: { python: { requirements: ["Jinja2>=3.1,<4"], package: "ui8kit_jinja" } },
}
const FILES: Record<string, { utils: string[]; button: string[] }> = {
  templ: { utils: ["utils/utils.go"], button: ["ui/button/button.templ", "ui/button/button_templ.go"] },
  twig: { utils: ["runtime/Rt.php"], button: ["ui/button/Button.html.twig"] },
  latte: { utils: ["runtime/Rt.php"], button: ["ui/button/Button.latte"] },
  jinja2: { utils: ["ui8kit_jinja/__init__.py"], button: ["ui/button/button.html.j2"] },
}
const content = (rt: string, f: string) =>
  rt === "templ" && f.startsWith("ui/")
    ? `package button\n\nimport (\n\tuiutils "${GEN}"\n)\n\nvar _ = uiutils.Cn\n`
    : `// ${rt} ${f}\n`

let registryDir = ""
let server: { url: string; close: () => Promise<void> }
const originalCwd = process.cwd()
const originalHome = process.env.HOME

beforeAll(async () => {
  registryDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-server-reg-"))
  for (const rt of Object.keys(FILES)) {
    const write = (folder: string, item: Record<string, unknown>) => {
      const file = path.join(registryDir, rt, folder, `${item.name}.json`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(item))
    }
    const base = { runtime: rt, digest: "3.1.0", devDependencies: [] }
    write("utils", {
      ...base, name: "utils", type: "registry:utils", title: "Utils", description: "u", meta: META[rt],
      dependencies: rt === "twig" ? ["should-not-install"] : [], registryDependencies: [],
      files: FILES[rt]!.utils.map((f) => ({ path: f, target: f, content: content(rt, f) })),
    })
    write("components/ui", {
      ...base, name: "button", type: "registry:ui", title: "Button", description: "b", dependencies: [], registryDependencies: ["utils"],
      files: FILES[rt]!.button.map((f) => ({ path: f, target: f, content: content(rt, f) })),
    })
    fs.writeFileSync(
      path.join(registryDir, rt, "index.json"),
      JSON.stringify({ version: "3.1.0", components: [{ name: "utils", type: "registry:utils" }, { name: "button", type: "registry:ui" }] }),
    )
  }
  server = await serveDir(registryDir)
})
afterAll(async () => {
  await server.close()
  fs.rmSync(registryDir, { recursive: true, force: true })
})

let project = ""
let logs: string[] = []
let warns: string[] = []
beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-server-"))
  process.env.HOME = project
  process.chdir(project)
  logs = []
  warns = []
  installDependencies.mockClear()
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")))
  vi.spyOn(logger, "warn").mockImplementation((m: string) => void warns.push(String(m)))
})
afterEach(() => {
  process.chdir(originalCwd)
  process.env.HOME = originalHome
  resetCache()
  vi.restoreAllMocks()
  fs.rmSync(project, { recursive: true, force: true })
})

const init = (rt: string, dir = "internal") =>
  initCommand({ yes: true, framework: rt, dir, registryUrl: `${server.url}/${rt}`, strictCdn: true })

describe.each(Object.keys(FILES))("server runtime %s", (rt) => {
  it("init + add: no package.json, no npm install, lock + check ok, hints printed once", async () => {
    await init(rt)
    expect(fs.existsSync(path.join(project, "package.json"))).toBe(false)
    expect(fs.existsSync(path.join(project, "tsconfig.json"))).toBe(false)
    const config = JSON.parse(fs.readFileSync(path.join(project, "ui8kit.config.json"), "utf-8"))
    expect(config.typescript).toBe(false)
    logs = []
    await addCommand(["button"], { cache: false })
    for (const f of [...FILES[rt]!.utils, ...FILES[rt]!.button]) expect(fs.existsSync(path.join(project, "internal", f)), f).toBe(true)
    expect(installDependencies).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(project, "package.json"))).toBe(false)
    const lock = JSON.parse(fs.readFileSync(path.join(project, "ui8kit.lock.json"), "utf-8"))
    expect(Object.keys(lock.items).length).toBeGreaterThanOrEqual(2)
    const report = await runCheck({}, project)
    expect(report.errors).toEqual([])
    expect(report.ok).toBe(true)
    const expected = {
      templ: "go get github.com/a-h/templ@v0.3.1070",
      twig: 'composer require "twig/twig:^3.0"',
      latte: 'composer require "latte/latte:^3.0"',
      jinja2: 'pip install "Jinja2>=3.1,<4"',
    }[rt]!
    expect(logs.filter((l) => l.includes(expected))).toHaveLength(1)
    if (rt === "twig" || rt === "latte") {
      const ns = rt === "twig" ? "Twig" : "Latte"
      expect(logs.some((l) => l.includes(`"UI8Kit\\\\${ns}\\\\": "internal/runtime/"`))).toBe(true)
      expect(fs.existsSync(path.join(project, "composer.json"))).toBe(false)
    }
  })
})

describe("templ go import", () => {
  it("rewrites the generated utils import to <go.mod module>/<utils dir>; check stays green", async () => {
    fs.writeFileSync(path.join(project, "go.mod"), "module example.com/app\r\n\r\ngo 1.22\r\n")
    await init("templ")
    await addCommand(["button"], { cache: false })
    for (const f of FILES.templ!.button) {
      const text = fs.readFileSync(path.join(project, "internal", f), "utf-8")
      expect(text).toContain('uiutils "example.com/app/internal/utils"')
      expect(text).not.toContain(GEN)
    }
    expect(warns.some((w) => w.includes("go.mod"))).toBe(false)
    expect((await runCheck({}, project)).ok).toBe(true)
  })

  it("without go.mod keeps the import and warns with the exact manual fix", async () => {
    await init("templ")
    warns = []
    await addCommand(["button"], { cache: false })
    const text = fs.readFileSync(path.join(project, "internal/ui/button/button.templ"), "utf-8")
    expect(text).toContain(GEN)
    const w = warns.find((x) => x.includes("No go.mod"))
    expect(w).toContain("go mod init <module>")
    expect(w).toContain("<module>/internal/utils")
  })
})
