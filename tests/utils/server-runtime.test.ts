import { describe, expect, it } from "vitest"
import {
  collectToolchainHints,
  isServerRuntime,
  parseGoModulePath,
  rewriteGoImport,
  templUtilsImport,
  TEMPL_UTILS_IMPORT,
} from "../../src/utils/server-runtime.js"
import type { Component, Config } from "../../src/registry/schema.js"

const config = { dir: "internal", aliases: {} } as unknown as Config
const item = (runtime: string, meta: Record<string, unknown>): Component =>
  ({ name: "utils", type: "registry:utils", runtime, files: [], dependencies: [], devDependencies: [], registryDependencies: [], meta }) as unknown as Component

describe("server runtimes", () => {
  it("classifies runtimes", () => {
    for (const rt of ["templ", "latte", "twig", "jinja2"]) expect(isServerRuntime(rt)).toBe(true)
    for (const rt of ["react", "vue", undefined]) expect(isServerRuntime(rt)).toBe(false)
  })

  it("parses go.mod module (CRLF, comments, quoted)", () => {
    expect(parseGoModulePath("// c\r\nmodule example.com/app\r\n\r\ngo 1.22\r\n")).toBe("example.com/app")
    expect(parseGoModulePath('module "example.com/q" // x\n')).toBe("example.com/q")
    expect(parseGoModulePath("go 1.22\n")).toBeUndefined()
  })

  it("rewrites the generated utils import (aliased, sub-paths) and nothing else", () => {
    const src = `import (\n\t"strconv"\n\n\tuiutils "${TEMPL_UTILS_IMPORT}"\n\t"${TEMPL_UTILS_IMPORT}/sub"\n\t"${TEMPL_UTILS_IMPORT}x"\n)\n`
    const out = rewriteGoImport(src, TEMPL_UTILS_IMPORT, templUtilsImport("example.com/app", config))
    expect(out).toContain('uiutils "example.com/app/internal/utils"')
    expect(out).toContain('"example.com/app/internal/utils/sub"')
    expect(out).toContain(`"${TEMPL_UTILS_IMPORT}x"`)
    expect(out).toContain('"strconv"')
  })

  it("uses config.paths for the utils dir (posix even with backslashes)", () => {
    const c = { dir: "web\\app", aliases: {}, paths: { utils: "pkg/utils" } } as unknown as Config
    expect(templUtilsImport("m", c)).toMatch(/^m\/web\/app\/(pkg\/)?utils$/)
  })

  it("builds deduped, shell-safe commands and a PSR-4 snippet from meta", () => {
    const twig = item("twig", {
      composer: { require: { php: ">=8.1", "twig/twig": "^3.0" }, autoload: { "psr-4": { "UI8Kit\\Twig\\": "<dir>/runtime/" } } },
    })
    const hints = collectToolchainHints([twig, twig, item("jinja2", { python: { requirements: ["Jinja2>=3.1,<4"] } })], config, "/nonexistent")
    expect(hints.commands).toEqual(['composer require "twig/twig:^3.0"', 'pip install "Jinja2>=3.1,<4"'])
    expect(hints.notes.some((n) => n.includes('"UI8Kit\\\\Twig\\\\": "internal/runtime/"'))).toBe(true)
    expect(hints.notes.filter((n) => n.includes("psr-4"))).toHaveLength(1)
    expect(hints.warnings).toEqual([])
  })

  it("prints go get and warns with the manual fix when go.mod is missing", () => {
    const hints = collectToolchainHints(
      [item("templ", { go: { importPath: TEMPL_UTILS_IMPORT, require: ["github.com/a-h/templ@v0.3.1070"] } })],
      config,
      "/nonexistent",
    )
    expect(hints.commands).toEqual(["go get github.com/a-h/templ@v0.3.1070"])
    expect(hints.warnings[0]).toContain("go mod init")
    expect(hints.warnings[0]).toContain("<module>/internal/utils")
  })
})
