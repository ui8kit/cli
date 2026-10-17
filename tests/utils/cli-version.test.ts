import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, describe, expect, it } from "vitest"
import { getCliVersion, resolveCliVersion } from "../../src/utils/cli-version.js"

const tmp: string[] = []
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** <root>/package.json (host), <root>/node_modules/ui8kit/{package.json,dist/index.js}, <root>/node_modules/.bin/ui8kit -> ../ui8kit/dist/index.js */
function layout(host: Record<string, unknown>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-version-"))
  tmp.push(root)
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(host))
  const pkg = path.join(root, "node_modules", "ui8kit")
  fs.mkdirSync(path.join(pkg, "dist"), { recursive: true })
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "ui8kit", version: "7.7.7" }))
  const entry = path.join(pkg, "dist", "index.js")
  fs.writeFileSync(entry, "#!/usr/bin/env node\n")
  const bin = path.join(root, "node_modules", ".bin")
  fs.mkdirSync(bin, { recursive: true })
  fs.symlinkSync(path.relative(bin, entry), path.join(bin, "ui8kit"))
  return { root, pkg, entry, bin: path.join(bin, "ui8kit") }
}

describe("CLI version", () => {
  it("npx cache: ignores the npx manifest (no name, no version) next to node_modules", () => {
    const l = layout({ dependencies: { ui8kit: "^7.7.7" }, _npx: { packages: ["ui8kit"] } })
    expect(resolveCliVersion([l.bin])).toBe("7.7.7")
  })

  it("bin symlink inside a project: never reports the project's own version", () => {
    const l = layout({ name: "my-app", version: "9.9.9" })
    expect(resolveCliVersion([l.bin])).toBe("7.7.7")
  })

  it("direct run of dist/index.js and the bundle directory", () => {
    const l = layout({ name: "my-app", version: "9.9.9" })
    expect(resolveCliVersion([l.entry])).toBe("7.7.7")
    expect(resolveCliVersion([path.dirname(l.entry)])).toBe("7.7.7")
  })

  it("skips a start outside any ui8kit package and uses the next one", () => {
    const l = layout({ name: "my-app", version: "9.9.9" })
    expect(resolveCliVersion([l.root, l.bin])).toBe("7.7.7")
    expect(resolveCliVersion([l.root])).toBe("0.0.0")
    expect(resolveCliVersion([undefined, path.join(l.root, "missing.js")])).toBe("0.0.0")
  })

  it("getCliVersion reads this repo's package.json", () => {
    const own = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"))
    expect(getCliVersion()).toBe(own.version)
  })
})
