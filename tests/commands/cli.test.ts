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

function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
    windowsHide: true,
    env: {
      ...process.env,
      ...env,
      FORCE_COLOR: "0",
      CI: "1"
    }
  })
}

function runCliWithEnv(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  return runCli(args, cwd, env)
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

  it("creates an empty registry when scan source is missing", async () => {
    const cwd = createFixture()
    const outputFile = path.join(cwd, "src", "registry.json")

    const result = runCli(["scan", "--source", "./missing", "--output", outputFile], cwd)

    expect(result.status).toBe(0)
    const registry = await fs.readJson(outputFile)
    expect(Array.isArray(registry.items)).toBe(true)
    expect(registry.items.length).toBe(0)
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

  it("returns an error when build registry file is missing", () => {
    const cwd = createFixture()
    const outputDir = path.join(cwd, "packages", "registry", "r")

    const result = runCli(["build", "--output", outputDir], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toMatch(/ENOENT|no such file|Unexpected error/i)
  })

  it("returns an error when build source file is missing", async () => {
    const cwd = createFixture()
    const registryFile = path.join(cwd, "src", "registry.json")
    const outputDir = path.join(cwd, "packages", "registry", "r")
    const missingSourcePath = "src/components/ui/missing.tsx"

    await fs.ensureDir(path.dirname(registryFile))
    await fs.writeJson(registryFile, {
      items: [
        {
          name: "missing",
          type: "registry:ui",
          dependencies: [],
          devDependencies: [],
          files: [{ path: missingSourcePath }]
        }
      ]
    })

    const result = runCli(["build", registryFile, "--output", outputDir], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain("File not found")
  })

  it("shows no local components found for diff on empty project", () => {
    const cwd = createFixture()

    const result = runCli(["diff"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain("No installed local components were found in this project.")
  })

  it("shows help for scan command", () => {
    const cwd = createFixture()
    const result = runCli(["scan", "--help"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain("Usage:")
    expect(output).toContain("scan")
    expect(output).toContain("Scan and generate registry from existing components")
  })

  it("shows help for init command", () => {
    const cwd = createFixture()
    const result = runCli(["init", "--help"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain("Usage:")
    expect(output).toContain("Initialize UI8Kit structure in your project")
  })

  it("shows help for add command", () => {
    const cwd = createFixture()
    const result = runCli(["add", "--help"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain("Usage:")
    expect(output).toContain("Add components to your project from the registry")
  })

  it("shows help for diff command", () => {
    const cwd = createFixture()
    const result = runCli(["diff", "--help"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain("Usage:")
    expect(output).toContain("Show local vs registry differences")
  })

  it("shows help for list command", () => {
    const cwd = createFixture()
    const result = runCli(["list", "--help"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain("Usage:")
    expect(output).toContain("List available components in registry")
  })

  it("shows help for cache command", () => {
    const cwd = createFixture()
    const result = runCli(["cache", "--help"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain("Usage:")
    expect(output).toContain("Manage local cache")
  })

  it("returns cached list in JSON via CLI without network", () => {
    const cwd = createFixture()
    const homeDir = path.join(cwd, ".home")
    const now = Date.now()
    const cacheBase = path.join(homeDir, ".ui8kit", "cache")
    const indexFile = path.join(cacheBase, "ui", "index.json")
    const indexMeta = `${indexFile}.meta.json`
    const componentFile = path.join(cacheBase, "ui", "components", "button.json")
    const componentMeta = `${componentFile}.meta.json`

    fs.ensureDirSync(path.dirname(indexFile))
    fs.writeJsonSync(indexFile, {
      components: [{ name: "button", type: "registry:ui" }]
    })
    fs.writeJsonSync(indexMeta, { lastFetched: now, ttl: 3_600_000 })
    fs.ensureDirSync(path.dirname(componentFile))
    fs.writeJsonSync(componentFile, {
      name: "button",
      type: "registry:ui",
      dependencies: [],
      devDependencies: [],
      files: [{ path: "components/ui/button.tsx", content: "export const Button = () => null\n" }]
    })
    fs.writeJsonSync(componentMeta, { lastFetched: now, ttl: 3_600_000 })

    const result = runCliWithEnv(["list", "--json"], cwd, {
      HOME: homeDir,
      USERPROFILE: homeDir,
      FORCE_COLOR: "0",
      CI: "1"
    })

    expect(result.status).toBe(0)
    const payload = JSON.parse(result.stdout)
    expect(Array.isArray(payload)).toBe(true)
    expect(payload).toHaveLength(1)
    expect(payload[0].name).toBe("button")
    expect(payload[0].type).toBe("registry:ui")
  })

  it("returns info diagnostics as JSON", () => {
    const cwd = createFixture()
    const homeDir = path.join(cwd, ".home")

    const result = runCliWithEnv(["info", "--json"], cwd, {
      HOME: homeDir,
      USERPROFILE: homeDir
    })
    const payload = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(payload.version).toBeTruthy()
    expect(payload.packageManager).toBeTruthy()
    expect(payload.configFound).toBe(false)
    expect(payload.cdn).toHaveProperty("url")
    expect(payload.cdn).toHaveProperty("ok")
  })

  it("removes cache files with a dedicated home directory", async () => {
    const cwd = createFixture()
    const homeDir = path.join(cwd, ".home")
    const cachePath = path.join(homeDir, ".ui8kit", "cache")
    const payloadPath = path.join(cachePath, "index.json")

    await fs.ensureDir(path.dirname(payloadPath))
    await fs.writeJson(payloadPath, { test: true })

    const result = runCliWithEnv(["cache", "clear"], cwd, {
      HOME: homeDir,
      USERPROFILE: homeDir
    })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(await fs.pathExists(payloadPath)).toBe(false)
    expect(output).toContain("cache cleared successfully")
  })

  it("idempotently clears cache when no cache directory exists", async () => {
    const cwd = createFixture()
    const homeDir = path.join(cwd, ".home")
    const cachePath = path.join(homeDir, ".ui8kit", "cache")

    const result = runCliWithEnv(["cache", "clear"], cwd, {
      HOME: homeDir,
      USERPROFILE: homeDir
    })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(await fs.pathExists(cachePath)).toBe(false)
    expect(output).toContain("cache cleared successfully")
  })

  it("returns an error for unknown command options", () => {
    const cwd = createFixture()

    const result = runCli(["info", "--non-existent-option"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).not.toBe(0)
    expect(output).toContain("unknown option")
  })

  it("returns error for unknown commands", () => {
    const cwd = createFixture()
    const result = runCli(["this-does-not-exist"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain("Invalid command")
    expect(output).toContain("See --help")
  })
})
