import { mkdirSync, writeFileSync } from "node:fs"
import { cacheScope } from "../../src/registry/api.js"
import {
  ensureDir,
  pathExists,
  readJson,
  writeJson,
  remove,
  readFile,
  writeFile,
} from "../../src/utils/fs.js"
import path from "path"
import os from "os"
import { spawnSync } from "node:child_process"
import { beforeAll, afterEach, describe, expect, it } from "vitest"
import http from "node:http"
import { AddressInfo } from "node:net"

const PROJECT_ROOT = process.cwd()
const CLI_PATH = path.join(PROJECT_ROOT, "dist", "index.js")

function tempDir(): string {
  return path.join(os.tmpdir(), `ui8kit-cli-e2e-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

function buildCliIfNeeded() {
  const build = spawnSync(`${npmCommand()} run build`, {
    cwd: PROJECT_ROOT,
    encoding: "utf-8",
    stdio: "pipe",
    shell: true,
    env: { ...process.env, CI: "1" }
  })

  if (build.status !== 0) {
    throw new Error(`Build failed before integration tests. ${build.stdout ?? ""} ${build.stderr ?? build.error?.message ?? ""}`)
  }
}

function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 120_000,
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
      await remove(fixtureDir)
      fixtureDir = ""
    }
  }

  const createFixture = () => {
    fixtureDir = tempDir()
    mkdirSync(fixtureDir, { recursive: true })
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

    await ensureDir(sourcePath)
    await writeFile(
      path.join(sourcePath, "button.tsx"),
      "export const Button = () => null\n"
    )

    const result = runCli(["scan", "--source", "./src", "--output", outputFile], cwd)

    expect(result.status).toBe(0)
    const registry = await readJson(outputFile)
    expect(Array.isArray(registry.items)).toBe(true)
    expect(registry.items.some((item: any) => item.name === "button" && item.type === "registry:ui")).toBe(true)
  })

  it("creates an empty registry when scan source is missing", async () => {
    const cwd = createFixture()
    const outputFile = path.join(cwd, "src", "registry.json")

    const result = runCli(["scan", "--source", "./missing", "--output", outputFile], cwd)

    expect(result.status).toBe(0)
    const registry = await readJson(outputFile)
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

    await ensureDir(path.dirname(sourceFile))
    await writeFile(sourceFile, "export const Button = () => null\n")
    await writeJson(registryFile, {
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
    expect(await pathExists(generatedComponent)).toBe(true)
    expect(await pathExists(indexFile)).toBe(true)
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

    await ensureDir(path.dirname(registryFile))
    await writeJson(registryFile, {
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
    expect(output).toContain("Initialize universal kit folders")
    expect(output).toContain("--framework")
    expect(output).toContain("--dir")
  })

  it("shows help for add command", () => {
    const cwd = createFixture()
    const result = runCli(["add", "--help"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain("Usage:")
    expect(output).toContain("Add components from the registry into app folders")
    expect(output).toContain("--runtime")
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

  it.skip("supports init -> add -> reset -> init cycle", async () => {
    const cwd = createFixture()
    const server = http.createServer((request, response) => {
      if (request.url === "/registry/index.json") {
        response.writeHead(200, { "Content-Type": "application/json" })
        response.end(JSON.stringify({ components: [{ name: "button", type: "registry:ui" }] }))
        return
      }

      if (request.url === "/registry/components/ui/button.json") {
        response.writeHead(200, { "Content-Type": "application/json" })
        response.end(JSON.stringify({
          name: "button",
          type: "registry:ui",
          dependencies: [],
          devDependencies: [],
          files: [
            {
              path: "components/ui/button.tsx",
              content: "export const Button = () => null\n"
            }
          ]
        }))
        return
      }

      if (request.url === "/registry/components/variants/index.json") {
        response.writeHead(404, { "Content-Type": "application/json" })
        response.end(JSON.stringify({ error: "not-found" }))
        return
      }

      response.writeHead(404, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "not-found" }))
    })

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address() as AddressInfo
    const registryUrl = `http://127.0.0.1:${address.port}/registry`

    try {
      await writeJson(path.join(cwd, "package.json"), {
        name: "tmp-ui8kit-project",
        version: "1.0.0",
        dependencies: {
          react: "^18.2.0",
          "clsx": "^2.1.1",
          "tailwind-merge": "^2.3.0"
        }
      })
      await writeFile(path.join(cwd, "vite.config.ts"), "export default {}")

      const initResult = runCli(["init", "--yes", "--registry-url", registryUrl], cwd)
      expect(initResult.status).toBe(0)

      const addResult = runCli(["add", "button", "--registry-url", registryUrl], cwd)
      expect(addResult.status).toBe(0)
      expect(await pathExists(path.join(cwd, "src", "components", "ui", "button.tsx"))).toBe(true)

      const resetResult = runCli(["reset", "--yes"], cwd)
      expect(resetResult.status).toBe(0)
      expect(await pathExists(path.join(cwd, "ui8kit.config.json"))).toBe(false)
      expect(await pathExists(path.join(cwd, "src", "components", "ui", "button.tsx"))).toBe(false)

      const reinitResult = runCli(["init", "--yes", "--registry-url", registryUrl], cwd)
      expect(reinitResult.status).toBe(0)
      expect(await pathExists(path.join(cwd, "ui8kit.config.json"))).toBe(true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it("shows help for registry clean command", () => {
    const cwd = createFixture()
    const result = runCli(["registry", "clean", "--help"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain("Usage:")
    expect(output).toContain("registry clean")
  })

  it("runs registry clean in dry-run mode", () => {
    const cwd = createFixture()
    mkdirSync(path.join(cwd, "packages", "registry", "r"), { recursive: true })
    const result = runCli(["registry", "clean", "--dry-run"], cwd)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain("Dry run enabled")
  })

  it("returns cached list in JSON via CLI without network", () => {
    const cwd = createFixture()
    const homeDir = path.join(cwd, ".home")
    const now = Date.now()
    const cacheBase = path.join(homeDir, ".ui8kit", "cache")
    // Cache is scoped by resolved registry bases + runtime (no config here → defaults).
    const scope = cacheScope("ui", { cdn: { runtime: undefined } })
    const indexFile = path.join(cacheBase, ...scope.split("/"), "index.json")
    const indexMeta = `${indexFile}.meta.json`
    const componentFile = path.join(cacheBase, ...scope.split("/"), "components", "button.json")
    const componentMeta = `${componentFile}.meta.json`

    mkdirSync(path.dirname(indexFile), { recursive: true })
    writeFileSync(indexFile, `${JSON.stringify({
      components: [{ name: "button", type: "registry:ui" }]
    }, null, 2)}\n`)
    writeFileSync(indexMeta, `${JSON.stringify({ lastFetched: now, ttl: 3_600_000 }, null, 2)}\n`)
    mkdirSync(path.dirname(componentFile), { recursive: true })
    writeFileSync(componentFile, `${JSON.stringify({
      name: "button",
      type: "registry:ui",
      dependencies: [],
      devDependencies: [],
      files: [{ path: "components/ui/button.tsx", content: "export const Button = () => null\n" }]
    }, null, 2)}\n`)
    writeFileSync(componentMeta, `${JSON.stringify({ lastFetched: now, ttl: 3_600_000 }, null, 2)}\n`)

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

    await ensureDir(path.dirname(payloadPath))
    await writeJson(payloadPath, { test: true })

    const result = runCliWithEnv(["cache", "clear"], cwd, {
      HOME: homeDir,
      USERPROFILE: homeDir
    })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(await pathExists(payloadPath)).toBe(false)
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
    expect(await pathExists(cachePath)).toBe(false)
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
