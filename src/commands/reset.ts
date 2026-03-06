import fs from "fs-extra"
import path from "path"
import prompts from "prompts"
import { logger } from "../utils/logger.js"
import { handleError } from "../utils/errors.js"
import { clearCache } from "../utils/cache.js"
import { SCHEMA_CONFIG } from "../utils/schema-config.js"
import { isSafePath, getRegistryCleanTargets } from "./registry.js"

interface ResetOptions {
  dryRun?: boolean
  force?: boolean
  yes?: boolean
  withCache?: boolean
}

interface ProjectConfig {
  componentsDir?: string
  libDir?: string
}

export async function resetCommand(options: ResetOptions = {}) {
  const cwd = path.resolve(process.cwd())
  if (options.withCache) {
    logger.info("Cache cleanup requested.")
    await clearCache()
  }

  const targets = await gatherResetTargets(cwd)

  if (targets.length === 0) {
    logger.info("No UI8Kit state files found to reset.")
    return
  }

  if (options.dryRun) {
    logger.info("Reset dry-run. No files were removed.")
    targets.forEach((target) => logger.info(`  ${target}`))
    logger.info(`Total: ${targets.length}`)
    return
  }

  if (!options.force && !options.yes) {
    const { ok } = await prompts({
      type: "confirm",
      name: "ok",
      message: "This will remove local UI8Kit generated files and cannot be undone. Continue?",
      initial: false
    })
    if (!ok) {
      logger.warn("Reset was cancelled.")
      return
    }
  }

  try {
    for (const target of targets) {
      await fs.remove(target)
      logger.info(`removed: ${target}`)
    }
    logger.success(`Reset complete. Removed ${targets.length} path(s).`)
  } catch (error) {
    handleError(error)
  }
}

async function gatherResetTargets(cwd: string): Promise<string[]> {
  const normalizedCwd = path.resolve(cwd)
  const registryTargets = getRegistryCleanTargets(normalizedCwd, true)

  const configPath = path.join(normalizedCwd, "ui8kit.config.json")
  const configCandidates = [
    configPath,
    path.join(normalizedCwd, "src", "ui8kit.config.json")
  ]

  const discoveredTargets: string[] = []

  for (const target of configCandidates) {
    if (await fs.pathExists(target)) {
      discoveredTargets.push(target)
    }
  }

  const config = await readConfig(discoveredTargets.at(0))
  const componentsDir = path.resolve(normalizedCwd, config?.componentsDir || SCHEMA_CONFIG.defaultDirectories.components)
  const libDir = path.resolve(normalizedCwd, config?.libDir || SCHEMA_CONFIG.defaultDirectories.lib)
  const variantsDir = path.join(normalizedCwd, SCHEMA_CONFIG.defaultDirectories.variants)
  const layoutsDir = path.join(normalizedCwd, SCHEMA_CONFIG.defaultDirectories.layouts)
  const blocksDir = path.join(normalizedCwd, SCHEMA_CONFIG.defaultDirectories.blocks)

  const projectTargets = [componentsDir, libDir, variantsDir, layoutsDir, blocksDir]

  const allTargets = [
    ...registryTargets,
    ...discoveredTargets,
    ...projectTargets
  ]

  const uniqueTargets = [...new Set(allTargets)]
  return uniqueTargets.filter((target) => isSafePath(target, normalizedCwd) && fs.pathExistsSync(target))
}

async function readConfig(configPath?: string): Promise<ProjectConfig | null> {
  if (!configPath || !(await fs.pathExists(configPath))) {
    return null
  }

  try {
    const config = await fs.readJson(configPath)
    return {
      componentsDir: config.componentsDir,
      libDir: config.libDir
    }
  } catch {
    return null
  }
}

