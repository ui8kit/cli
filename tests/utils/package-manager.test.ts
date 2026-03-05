import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { detectPackageManager } from "../../src/utils/package-manager.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-pm-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`)
}

describe("package manager detection", () => {
  const originalCwd = process.cwd()
  let fixture = ""

  beforeEach(() => {
    fixture = tempDir()
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await fs.remove(fixture)
  })

  it("returns bun when bun.lock exists", async () => {
    await fs.ensureDir(fixture)
    await fs.writeFile(path.join(fixture, "bun.lock"), "")
    process.chdir(fixture)

    expect(await detectPackageManager()).toBe("bun")
  })

  it("returns pnpm when pnpm-lock.yaml exists", async () => {
    await fs.ensureDir(fixture)
    await fs.writeFile(path.join(fixture, "pnpm-lock.yaml"), "")
    process.chdir(fixture)

    expect(await detectPackageManager()).toBe("pnpm")
  })

  it("returns npm fallback when no lockfiles are present", async () => {
    await fs.ensureDir(fixture)
    process.chdir(fixture)

    expect(await detectPackageManager()).toBe("npm")
  })

  it("reads packageManager field from package.json", async () => {
    await fs.ensureDir(fixture)
    await fs.writeJson(path.join(fixture, "package.json"), {
      packageManager: "bun@1.2.3"
    })
    process.chdir(fixture)

    expect(await detectPackageManager()).toBe("bun")
  })
}) 
