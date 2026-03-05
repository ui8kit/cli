import fs from "fs-extra"
import path from "path"
import os from "os"
import { spawnSync } from "node:child_process"
import { beforeAll, afterEach, describe, expect, it } from "vitest"

const PROJECT_ROOT = process.cwd()
const CLI_PATH = path.join(PROJECT_ROOT, "dist", "index.js")

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-cli-e2e-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

function buildCliIfNeeded() {
  if (!fs.pathExistsSync(CLI_PATH)) {
    const build = spawnSync(npmCommand(), ["run", "build"], {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      stdio: "pipe",
      env: { ...process.env, CI: "1" }
    })

    if (build.status !== 0) {
      throw new Error(`Build failed before integration tests. ${build.stdout} ${build.stderr}`)
    }
  }
}

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
    windowsHide: true,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      CI: "1"
    }
  })
}

describe("CLI integration commands", () => {
  let fixtureDir = ""

  const cleanup = async () => {
    if (fixtureDir) {
      await fs.remove(fixtureDir)
      fixtureDir = ""
    }
  }

  const createFixture = () => {
    fixtureDir = tempDir()
    fs.ensureDirSync(fixtureDir)
    return fixtureDir
  }

  beforeAll(() => {
    buildCliIfNeeded()
  })

  afterEach(async () => {
    await cleanup()
  })

  it("prints help from --help", () => {
    const cwd = createFixture()

    const result = runCli(["--help"], cwd)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Usage: ui8kit")
    expect(result.stdout).toContain("Commands:")
  })

  it("runs info command in an empty directory", () => {
    const cwd = createFixture()

    const result = runCli(["info"], cwd)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Config  not found")
    expect(result.stdout).toContain("Node")
    expect(result.stdout).toContain("PM")
  })

  it("runs scan and writes registry output", async () => {
    const cwd = createFixture()
    const sourcePath = path.join(cwd, "src", "components", "ui")
    const outputFile = path.join(cwd, "src", "registry.json")

    await fs.ensureDir(sourcePath)
    await fs.writeFile(
      path.join(sourcePath, "button.tsx"),
      "export const Button = () => null\n"
    )

    const result = runCli(["scan", "--source", "./src", "--output", outputFile], cwd)

    expect(result.status).toBe(0)
    const registry = await fs.readJson(outputFile)
    expect(Array.isArray(registry.items)).toBe(true)
    expect(registry.items.some((item: any) => item.name === "button" && item.type === "registry:ui")).toBe(true)
  })

  it("runs build command and generates registry output", async () => {
    const cwd = createFixture()
    const sourceFile = path.join(cwd, "src", "components", "ui", "button.tsx")
    const registryFile = path.join(cwd, "src", "registry.json")
    const outputDir = path.join(cwd, "packages", "registry", "r")
    const indexFile = path.join(outputDir, "index.json")
    const generatedComponent = path.join(outputDir, "components", "ui", "button.json")

    await fs.ensureDir(path.dirname(sourceFile))
    await fs.writeFile(sourceFile, "export const Button = () => null\n")
    await fs.writeJson(registryFile, {
      items: [
        {
          name: "button",
          type: "registry:ui",
          dependencies: [],
          devDependencies: [],
          files: [{ path: "src/components/ui/button.tsx" }]
        }
      ]
    })

    const result = runCli(["build", registryFile, "--output", outputDir], cwd)

    expect(result.status).toBe(0)
    expect(await fs.pathExists(generatedComponent)).toBe(true)
    expect(await fs.pathExists(indexFile)).toBe(true)
  })
})
