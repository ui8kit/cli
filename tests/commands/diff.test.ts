import fs from "fs-extra"
import path from "path"
import os from "os"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { diffCommand } from "../../src/commands/diff.js"
import * as registryApi from "../../src/registry/api.js"
import { logger } from "../../src/utils/logger.js"
import { CLI_MESSAGES } from "../../src/utils/cli-messages.js"

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-diff-test-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

describe("diff command", () => {
  let fixture = ""
  const originalCwd = process.cwd()
  let output: string[] = []

  beforeEach(async () => {
    fixture = tempDir()
    await fs.ensureDir(fixture)
    process.chdir(fixture)
    output = []
    vi.spyOn(console, "log").mockImplementation((line) => {
      output.push(String(line))
    })
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await fs.remove(fixture)
  })

  it("warns when no local components found", async () => {
    vi.spyOn(registryApi, "getAllComponents").mockResolvedValue([])
    const warnSpy = vi.spyOn(logger, "warn")

    await diffCommand()

    expect(warnSpy).toHaveBeenCalledWith(CLI_MESSAGES.errors.noLocalInstall)
  })

  it("detects up-to-date local components", async () => {
    const localContent = "export const Button = () => null\n"
    const remoteContent = localContent
    await fs.ensureDir(path.join(fixture, "src", "components", "ui"))
    await fs.writeFile(path.join(fixture, "src", "components", "ui", "button.tsx"), localContent)

    vi.spyOn(registryApi, "getAllComponents").mockResolvedValue([
      {
        name: "button",
        type: "registry:ui",
        dependencies: [],
        devDependencies: [],
        files: [{ path: "components/ui/button.tsx", content: remoteContent }]
      }
    ] as any)

    const infoSpy = vi.spyOn(logger, "info")
    await diffCommand()

    const infoCalls = infoSpy.mock.calls.flat().map((item) => String(item[0]))
    expect(infoCalls.some(line => line.includes("button (registry:ui)"))).toBe(true)
  })

  it("detects changed local components", async () => {
    const localContent = "export const Button = () => null\n"
    const remoteContent = "export const Button = () => <button />\n"
    await fs.ensureDir(path.join(fixture, "src", "components", "ui"))
    await fs.writeFile(path.join(fixture, "src", "components", "ui", "button.tsx"), localContent)

    vi.spyOn(registryApi, "getAllComponents").mockResolvedValue([
      {
        name: "button",
        type: "registry:ui",
        dependencies: [],
        devDependencies: [],
        files: [{ path: "components/ui/button.tsx", content: remoteContent }]
      }
    ] as any)

    await diffCommand()

    const infoLines = output.join("\n")
    expect(infoLines).toContain("component(s) have updates")
  })

  it("supports JSON output format", async () => {
    const localContent = "export const Button = () => null\n"
    const remoteContent = localContent
    await fs.ensureDir(path.join(fixture, "src", "components", "ui"))
    await fs.writeFile(path.join(fixture, "src", "components", "ui", "button.tsx"), localContent)

    vi.spyOn(registryApi, "getAllComponents").mockResolvedValue([
      {
        name: "button",
        type: "registry:ui",
        dependencies: [],
        devDependencies: [],
        files: [{ path: "components/ui/button.tsx", content: remoteContent }]
      }
    ] as any)

    output = []
    await diffCommand(undefined, { json: true })

    const payload = JSON.parse(output[0])
    expect(payload).toHaveLength(1)
    expect(payload[0].status).toBe("up-to-date")
  })

  it("warns when requested local component is missing", async () => {
    const localContent = "export const Button = () => null\n"
    await fs.ensureDir(path.join(fixture, "src", "components", "ui"))
    await fs.writeFile(path.join(fixture, "src", "components", "ui", "button.tsx"), localContent)
    vi.spyOn(registryApi, "getAllComponents").mockResolvedValue([
      {
        name: "button",
        type: "registry:ui",
        dependencies: [],
        devDependencies: [],
        files: [{ path: "components/ui/button.tsx", content: localContent }]
      }
    ] as any)

    const warnSpy = vi.spyOn(logger, "warn")
    await diffCommand("missing")

    expect(warnSpy).toHaveBeenCalledWith(`Component "missing" not found in local project structure`)
  })
})
