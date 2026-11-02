/**
 * Regression for alexy-os/chaosbun#123 (ui8kit 3.4.0 init):
 *  1. re-running init on a project installed from npm:@ui8kit/registry (3.3) switched it silently to
 *     registry.buildy.tw, whose `utils` item writes compose helpers without `safeRest` over `<dir>/utils`;
 *  2. `@source "../../../kit/react/src"` (registry source monorepo path) landed in src/styles/index.css and
 *     `globalCss` pointed at a missing src/index.css.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { pickGlobalCss } from "../../src/commands/init.js"
import { planItemFiles, stripEscapingCssSources } from "../../src/utils/install-plan.js"
import { pinnedLockSource, type LockFile } from "../../src/utils/lock.js"
import { buildInitConfig } from "../../src/commands/init.js"

const lock = (source: string): LockFile => ({
  lockVersion: 2,
  cli: "3.3.0",
  items: {
    "x|react|utils": { name: "utils", type: "registry:utils", source, version: "3.3.1", runtime: "react", files: {} },
    "x|react|rules": { name: "rules", type: "registry:rules", source, version: "3.3.1", runtime: "react", files: {} },
  },
})

describe("#123 registry pin from ui8kit.lock.json", () => {
  const buildy = ["https://registry.buildy.tw/react"]
  it("keeps the npm registry a 3.3 project was installed from", () => {
    const src = "https://unpkg.com/@ui8kit/registry@3/r/react"
    expect(pinnedLockSource(lock(src), buildy)).toBe(src)
  })
  it("does not pin when the lock already uses the default registry (any version/host path)", () => {
    expect(pinnedLockSource(lock("https://registry.buildy.tw/react"), buildy)).toBeUndefined()
  })
  it("does not pin without a lock", () => {
    expect(pinnedLockSource(null, buildy)).toBeUndefined()
  })
})

describe("#123 style paths", () => {
  const css = [
    '@import "./theme.css";',
    '@source "../";',
    '@source "../../../kit/react/src";',
    '@source "../../node_modules/@acme/ui";',
    '@source "../kit";',
    "",
  ].join("\n")

  it("drops @source paths that leave the project root, keeps project paths", () => {
    const out = stripEscapingCssSources(css, "src/styles/index.css")
    expect(out).not.toContain("kit/react/src")
    expect(out).toContain('@source "../";')
    expect(out).toContain('@source "../kit";')
    expect(out).toContain('@source "../../node_modules/@acme/ui";')
  })

  it("planItemFiles applies it to registry CSS", () => {
    const config = buildInitConfig({ yes: true, registry: "ui", framework: "react" })
    const [f] = planItemFiles(
      { name: "utils", type: "registry:utils", files: [{ path: "styles/index.css", target: "styles/index.css", content: css }] } as never,
      config,
      "react",
    )
    expect(f!.rel).toBe("src/styles/index.css")
    expect(f!.content).not.toContain("../../../kit")
  })

  let tmp = ""
  afterEach(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }))
  it("globalCss points at the installed styles entry when src/index.css is missing", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-123-"))
    const written = ["src/styles/theme.css", "src/styles/index.css", "src/utils/cn.ts"]
    expect(pickGlobalCss("src/index.css", written, tmp)).toBe("src/styles/index.css")
    fs.mkdirSync(path.join(tmp, "src"))
    fs.writeFileSync(path.join(tmp, "src/index.css"), "")
    expect(pickGlobalCss("src/index.css", written, tmp)).toBe("src/index.css")
    expect(pickGlobalCss("src/index.css", ["src/utils/cn.ts"], path.join(tmp, "none"))).toBe("src/index.css")
  })
})
