import chalk from "chalk"
import ora from "ora"
import path from "path"
import fs from "fs-extra"
import { execa } from "execa"
import { CLI_MESSAGES } from "./cli-messages.js"
import {
  checkProjectDependencies,
  showDependencyStatus,
  filterMissingDependencies,
  isWorkspaceError
} from "./dependency-checker.js"

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun"

export interface InstallDependenciesOptions {
  useSpinner?: boolean
  spinnerText?: string
}

export async function installDependencies(
  dependencies: string[],
  options: InstallDependenciesOptions = {}
): Promise<void> {
  const useSpinner = options.useSpinner ?? true
  const spinner = useSpinner
    ? ora(options.spinnerText ?? CLI_MESSAGES.status.installing("dependencies", "")).start()
    : null

  try {
    const depStatus = await checkProjectDependencies(dependencies)
    const missingDependencies = await filterMissingDependencies(dependencies)

    if (missingDependencies.length === 0) {
      spinner?.succeed(CLI_MESSAGES.success.depsAvailable)
      if (depStatus.workspace.length > 0) {
        console.log(chalk.blue(`   🔗 Using workspace dependencies: ${depStatus.workspace.join(", ")}`))
      }
      return
    }

    showDependencyStatus(depStatus)

    const packageManager = await detectPackageManager()
    const installCommand =
      packageManager === "npm"
        ? ["install", ...missingDependencies]
        : ["add", ...missingDependencies]

    await execa(packageManager, installCommand, {
      cwd: process.cwd(),
      stdio: "pipe"
    })

    spinner?.succeed(CLI_MESSAGES.success.depsInstalled)
  } catch (error) {
    spinner?.fail(CLI_MESSAGES.errors.dependenciesFailed)

    const errorMessage = (error as any).stderr || (error as Error).message

    if (isWorkspaceError(errorMessage)) {
      console.log(chalk.yellow(`\n💡 ${CLI_MESSAGES.info.workspaceDepsDetected}`))

      const results = await installDependenciesIndividually(dependencies)
      if (results.some(result => result.success)) {
        console.log(chalk.green("✅ Some dependencies installed successfully"))
        return
      }
    }

    throw new Error(`${CLI_MESSAGES.errors.dependenciesFailed}: ${errorMessage}`)
  }
}

export async function installDependenciesIndividually(
  dependencies: string[]
): Promise<Array<{ dep: string; success: boolean }>> {
  const packageManager = await detectPackageManager()
  const results: Array<{ dep: string; success: boolean }> = []
  const missingDeps = await filterMissingDependencies(dependencies)

  for (const dep of missingDeps) {
    try {
      const installCommand = packageManager === "npm" ? ["install", dep] : ["add", dep]

      await execa(packageManager, installCommand, {
        cwd: process.cwd(),
        stdio: "pipe"
      })

      console.log(chalk.green(`   ✅ Installed ${dep}`))
      results.push({ dep, success: true })
    } catch {
      console.log(chalk.yellow(`   ⚠️  Skipped ${dep} (may already be available)`))
      results.push({ dep, success: false })
    }
  }

  return results
}

export async function detectPackageManager(): Promise<PackageManager> {
  let dir = process.cwd()
  while (true) {
    if (await fs.pathExists(path.join(dir, "bun.lock")) || await fs.pathExists(path.join(dir, "bun.lockb"))) {
      return "bun"
    }
    if (await fs.pathExists(path.join(dir, "pnpm-lock.yaml"))) return "pnpm"
    if (await fs.pathExists(path.join(dir, "yarn.lock"))) return "yarn"

    const packageJsonPath = path.join(dir, "package.json")
    if (await fs.pathExists(packageJsonPath)) {
      try {
        const packageJson = await fs.readJson(packageJsonPath)
        const packageManager = String(packageJson.packageManager ?? "")
        if (packageManager.startsWith("bun@")) return "bun"
        if (packageManager.startsWith("pnpm@")) return "pnpm"
        if (packageManager.startsWith("yarn@")) return "yarn"
        if (packageManager.startsWith("npm@")) return "npm"
      } catch {
        // Ignore invalid package.json and continue searching parent directories.
      }
    }

    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return "npm"
}
