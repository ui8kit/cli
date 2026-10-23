import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
// @ts-expect-error plain .mjs helpers
import { buildFixtureRegistry } from "../fixtures/build-fixture-registry.mjs"
// @ts-expect-error plain .mjs helpers
import { serveDir } from "../helpers/static-server.mjs"
import { addCommand } from "../../src/commands/add.js"
import { analyzeLock, runCheck } from "../../src/commands/check.js"
import { resetCache } from "../../src/registry/api.js"
import { logger } from "../../src/utils/logger.js"
import { LOCK_FILE, exactVersion, hashContent, lockKey, migrateLock, readLock, registryIdentity, serializeLock, updateLock, type LockFile } from "../../src/utils/lock.js"

let registryDir = ""
let server: { url: string; close: () => Promise<void> }
const originalCwd = process.cwd()
const originalHome = process.env.HOME

beforeAll(async () => {
  registryDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-check-reg-"))
  buildFixtureRegistry(registryDir)
  server = await serveDir(registryDir)
})
afterAll(async () => {
  await server.close()
  fs.rmSync(registryDir, { recursive: true, force: true })
})

let project = ""
beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-check-"))
  process.env.HOME = project
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "p", private: true }))
  fs.writeFileSync(
    path.join(project, "ui8kit.config.json"),
    JSON.stringify({
      contractVersion: "2.0.0",
      framework: "react",
      runtime: "react",
      dir: "src",
      aliases: {},
      registry: "@ui8kit",
      registryUrl: `${server.url}/react`,
      strictCdn: true,
    }),
  )
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

const readLockJson = (): LockFile => JSON.parse(fs.readFileSync(path.join(project, LOCK_FILE), "utf-8"))

describe("ui8kit.lock.json + check", () => {
  it("add writes a sorted lock keyed identity|runtime|name with posix paths and sha256 hashes", async () => {
    await addCommand(["button"], { force: true, cache: false })
    const lock = readLockJson()
    expect(lock.lockVersion).toBe(2)
    expect(typeof lock.cli).toBe("string")
    const keys = Object.keys(lock.items)
    expect(keys).toEqual([...keys].sort())
    const base = `${server.url}/react`
    const key = `${new URL(server.url).host}|react|button`
    expect(keys).toContain(key)
    const button = lock.items[key]!
    expect(button).toMatchObject({ name: "button", source: base, version: null })
    for (const [rel, hash] of Object.entries(button.files)) {
      expect(rel).not.toContain("\\")
      expect(path.isAbsolute(rel)).toBe(false)
      expect(hash).toBe(hashContent(fs.readFileSync(path.resolve(project, rel), "utf-8")))
    }
    // serialization is deterministic
    expect(serializeLock(lock)).toBe(fs.readFileSync(path.join(project, LOCK_FILE), "utf-8"))
  })

  it("repeated add merges items", async () => {
    await addCommand(["button"], { force: true, cache: false })
    await addCommand(["card"], { force: true, cache: false })
    const names = Object.values(readLockJson().items).map((i) => i.name)
    expect(names).toContain("button")
    expect(names).toContain("card")
  })

  it("check passes, then reports modified and missing files", async () => {
    await addCommand(["button"], { force: true, cache: false })
    expect((await runCheck()).ok).toBe(true)

    const lock = readLockJson()
    const [first, second] = Object.keys(Object.values(lock.items).find((i) => i.name === "button")!.files)
    fs.appendFileSync(path.resolve(project, first!), "\n// edited\n")
    let report = await runCheck()
    expect(report.ok).toBe(false)
    expect(report.errors.map((e) => e.code)).toContain("modified")
    expect(report.errors.find((e) => e.code === "modified")!.message).toMatch(/importStyle/)

    if (second) {
      fs.rmSync(path.resolve(project, second))
      report = await runCheck()
      expect(report.errors.some((e) => e.code === "missing" && e.file === second)).toBe(true)
    }
  })

  it("CRLF line endings (git autocrlf) are not reported as modified", async () => {
    await addCommand(["button"], { force: true, cache: false })
    const rel = Object.keys(Object.values(readLockJson().items).find((i) => i.name === "button")!.files)[0]!
    const abs = path.resolve(project, rel)
    fs.writeFileSync(abs, fs.readFileSync(abs, "utf-8").replace(/\n/g, "\r\n"))
    expect((await runCheck()).ok).toBe(true)
  })

  it("no lock → error no-lock", async () => {
    const report = await runCheck()
    expect(report.ok).toBe(false)
    expect(report.errors[0]!.code).toBe("no-lock")
  })

  it("--adopt builds a lock from matching files and reports mismatches", async () => {
    await addCommand(["button", "card"], { force: true, cache: false })
    const old = readLockJson()
    fs.rmSync(path.join(project, LOCK_FILE))
    const cardFile = Object.keys(Object.values(old.items).find((i) => i.name === "card")!.files)[0]!
    fs.appendFileSync(path.resolve(project, cardFile), "\n// local change\n")

    resetCache()
    const report = await runCheck({ adopt: true, cache: false })
    expect(report.ok).toBe(true)
    expect(report.adopted!.items).toBeGreaterThan(0)
    expect(report.warnings.some((w) => w.code === "not-adopted" && w.file === cardFile)).toBe(true)
    const adopted = readLockJson()
    const button = Object.values(adopted.items).find((i) => i.name === "button")!
    expect(button.files).toEqual(Object.values(old.items).find((i) => i.name === "button")!.files)
    const card = Object.values(adopted.items).find((i) => i.name === "card")
    expect(card?.files[cardFile]).toBeUndefined()
  })
})

describe("lock helpers", () => {
  it("exactVersion rejects ranges and dist-tags", () => {
    expect(exactVersion("3")).toBeNull()
    expect(exactVersion("^3.1")).toBeNull()
    expect(exactVersion("canary")).toBeNull()
    expect(exactVersion(undefined, "3.0.0")).toBe("3.0.0")
    expect(exactVersion("3.1.0-canary.1")).toBe("3.1.0-canary.1")
  })

  it("analyzeLock flags mixed primitive versions and rules/primitives drift", async () => {
    const src = "https://cdn/r/react"
    const lock: LockFile = {
      lockVersion: 1,
      cli: "3.1.0",
      items: {
        [`${src}|button`]: { name: "button", type: "registry:ui", source: src, version: "3.0.0", runtime: "react", files: {} },
        [`${src}|text`]: { name: "text", type: "registry:ui", source: src, version: "3.1.0", runtime: "react", files: {} },
        [`${src}|rules`]: { name: "rules", type: "registry:rules", source: src, version: "3.0.0", runtime: "react", files: {} },
      },
    }
    const report = await analyzeLock(lock, async () => null)
    const codes = report.errors.map((e) => e.code)
    expect(codes).toContain("mixed-versions")
    expect(codes).toContain("rules-version")
    expect(report.ok).toBe(false)
  })
})

describe("lock keys (lockVersion 2)", () => {
  const files = [{ rel: "src\\ui\\button\\button.tsx", content: "x\n" }]

  it("identity ignores CDN host and version", () => {
    expect(registryIdentity("https://unpkg.com/@ui8kit/registry@3/r/react")).toEqual({ identity: "npm:@ui8kit/registry", runtime: "react" })
    expect(registryIdentity("https://cdn.jsdelivr.net/npm/@ui8kit/registry@3.0.0/r/react/")).toEqual({ identity: "npm:@ui8kit/registry", runtime: "react" })
    expect(registryIdentity("https://Registry.Buildy.tw/v2/solid")).toEqual({ identity: "registry.buildy.tw", runtime: "solid" })
    expect(registryIdentity("https://cdn.example.com/brand@1.2.0/r")).toEqual({ identity: "cdn.example.com/brand/r" })
  })

  it("unpkg then jsDelivr fallback → one entry (posix paths)", async () => {
    await updateLock([{ name: "button", type: "registry:ui", source: "https://unpkg.com/@ui8kit/registry@3/r/react", version: "3.0.0", runtime: "react", files }], project)
    await updateLock([{ name: "button", type: "registry:ui", source: "https://cdn.jsdelivr.net/npm/@ui8kit/registry@3/r/react", version: "3.0.1", runtime: "react", files }], project)
    const lock = (await readLock(project))!
    expect(Object.keys(lock.items)).toEqual(["npm:@ui8kit/registry|react|button"])
    const item = lock.items["npm:@ui8kit/registry|react|button"]!
    expect(item.source).toBe("https://cdn.jsdelivr.net/npm/@ui8kit/registry@3/r/react")
    expect(item.version).toBe("3.0.1")
    expect(Object.keys(item.files)).toEqual(["src/ui/button/button.tsx"])
  })

  it("brand host stays separate from primitives", async () => {
    await updateLock([
      { name: "button", type: "registry:ui", source: "https://unpkg.com/@ui8kit/registry@3/r/react", version: "3.0.0", runtime: "react", files },
      { name: "button", type: "registry:block", source: "https://registry.buildy.tw/react", version: "1.0.0", runtime: "react", files: [{ rel: "src/blocks/button.tsx", content: "y" }] },
    ], project)
    expect(Object.keys((await readLock(project))!.items)).toEqual(["npm:@ui8kit/registry|react|button", "registry.buildy.tw|react|button"])
  })

  it("migrates lockVersion 1 (rekey, dedupe keeping newest) and writes v2", async () => {
    const v1 = {
      lockVersion: 1,
      cli: "3.1.0",
      items: {
        "https://unpkg.com/@ui8kit/registry@3/r/react|button": { name: "button", type: "registry:ui", source: "https://unpkg.com/@ui8kit/registry@3/r/react", version: "3.0.1", runtime: "react", files: { "src/ui/button/button.tsx": "a" } },
        "https://cdn.jsdelivr.net/npm/@ui8kit/registry@3/r/react|button": { name: "button", type: "registry:ui", source: "https://cdn.jsdelivr.net/npm/@ui8kit/registry@3/r/react", version: "3.0.0", runtime: "react", files: { "src/ui/button/button.tsx": "b" } },
      },
    }
    expect(Object.values(migrateLock(v1 as LockFile).items).map((i) => i.version)).toEqual(["3.0.1"])
    fs.writeFileSync(path.join(project, LOCK_FILE), JSON.stringify(v1))
    await updateLock([{ name: "text", type: "registry:ui", source: "https://unpkg.com/@ui8kit/registry@3/r/react", version: "3.0.1", runtime: "react", files: [{ rel: "src/ui/text/text.tsx", content: "t" }] }], project)
    const written = readLockJson()
    expect(written.lockVersion).toBe(2)
    expect(Object.keys(written.items)).toEqual(["npm:@ui8kit/registry|react|button", "npm:@ui8kit/registry|react|text"])
    expect(written.items["npm:@ui8kit/registry|react|button"]!.files["src/ui/button/button.tsx"]).toBe("a")
    expect(lockKey("https://unpkg.com/@ui8kit/registry@3/r", "utils", "vue")).toBe("npm:@ui8kit/registry|vue|utils")
  })
})

