import path from "node:path"
import { spawn } from "node:child_process"
import { pathExists, readJson } from "./fs.js"
import { CLI_MESSAGES } from "./cli-messages.js"
import { logger, Spinner } from "./logger.js"
import {
  checkProjectDependencies,
  showDependencyStatus,
  filterMissingDependencies,
  isWorkspaceError,
} from "./dependency-checker.js"

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun"

export interface InstallDependenciesOptions {
  useSpinner?: boolean
  spinnerText?: string
}

function runCommand(command: string, args: string[], cwd = process.cwd()): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    })

    let stderr = ""
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })

    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve()
      else {
        const err = new Error(stderr || `${command} exited with code ${code}`)
        ;(err as Error & { stderr?: string }).stderr = stderr
        reject(err)
      }
    })
  })
}

export async function installDependencies(
  dependencies: string[],
  options: InstallDependenciesOptions = {},
): Promise<void> {
  const useSpinner = options.useSpinner ?? true
  const spinner = useSpinner
    ? new Spinner(options.spinnerText ?? CLI_MESSAGES.status.installing("dependencies", "")).start()
    : null

  try {
    const depStatus = await checkProjectDependencies(dependencies)
    const missingDependencies = await filterMissingDependencies(dependencies)

    if (missingDependencies.length === 0) {
      spinner?.succeed(CLI_MESSAGES.success.depsAvailable)
      if (depStatus.workspace.length > 0) {
        console.log(`   Using workspace dependencies: ${depStatus.workspace.join(", ")}`)
      }
      return
    }

    showDependencyStatus(depStatus)

    const packageManager = await detectPackageManager()
    const installCommand =
      packageManager === "npm"
        ? ["install", ...missingDependencies]
        : ["add", ...missingDependencies]

    await runCommand(packageManager, installCommand)
    spinner?.succeed(CLI_MESSAGES.success.depsInstalled)
  } catch (error) {
    spinner?.fail(CLI_MESSAGES.errors.dependenciesFailed)

    const errorMessage =
      (error as { stderr?: string }).stderr || (error as Error).message

    if (isWorkspaceError(errorMessage)) {
      console.log(`\n${CLI_MESSAGES.info.workspaceDepsDetected}`)

      const results = await installDependenciesIndividually(dependencies)
      if (results.some((result) => result.success)) {
        console.log("Some dependencies installed successfully")
        return
      }
    }

    throw new Error(`${CLI_MESSAGES.errors.dependenciesFailed}: ${errorMessage}`)
  }
}

export async function installDependenciesIndividually(
  dependencies: string[],
): Promise<Array<{ dep: string; success: boolean }>> {
  const packageManager = await detectPackageManager()
  const results: Array<{ dep: string; success: boolean }> = []
  const missingDeps = await filterMissingDependencies(dependencies)

  for (const dep of missingDeps) {
    try {
      const installCommand = packageManager === "npm" ? ["install", dep] : ["add", dep]
      await runCommand(packageManager, installCommand)
      logger.success(`Installed ${dep}`)
      results.push({ dep, success: true })
    } catch {
      logger.warn(`Skipped ${dep} (may already be available)`)
      results.push({ dep, success: false })
    }
  }

  return results
}

export async function detectPackageManager(): Promise<PackageManager> {
  let dir = process.cwd()
  while (true) {
    if (
      (await pathExists(path.join(dir, "bun.lock"))) ||
      (await pathExists(path.join(dir, "bun.lockb")))
    ) {
      return "bun"
    }
    if (await pathExists(path.join(dir, "pnpm-lock.yaml"))) return "pnpm"
    if (await pathExists(path.join(dir, "yarn.lock"))) return "yarn"

    const packageJsonPath = path.join(dir, "package.json")
    if (await pathExists(packageJsonPath)) {
      try {
        const packageJson = await readJson<{ packageManager?: string }>(packageJsonPath)
        const packageManager = String(packageJson.packageManager ?? "")
        if (packageManager.startsWith("bun@")) return "bun"
        if (packageManager.startsWith("pnpm@")) return "pnpm"
        if (packageManager.startsWith("yarn@")) return "yarn"
        if (packageManager.startsWith("npm@")) return "npm"
      } catch {
        // ignore
      }
    }

    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return "npm"
}
