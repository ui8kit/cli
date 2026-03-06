import fs from "fs-extra"
import path from "path"
import prompts from "prompts"
import { logger } from "../utils/logger.js"
import { handleError } from "../utils/errors.js"

const DEFAULT_BUILD_OUTPUT_DIR = path.join("packages", "registry", "r")
const REGISTRY_ROOT = path.join("packages", "registry")

interface RegistryCleanOptions {
  all?: boolean
  dryRun?: boolean
  force?: boolean
}

function normalizeWorkingPath(value: string): string {
  return path.resolve(value)
}

export function getDefaultRegistryOutputDir(cwd = process.cwd()): string {
  return normalizeWorkingPath(path.resolve(cwd, DEFAULT_BUILD_OUTPUT_DIR))
}

export function resolveRegistryBaseDir(cwd: string): string {
  return normalizeWorkingPath(path.resolve(cwd, REGISTRY_ROOT))
}

export function getRegistryCleanTargets(cwd: string, includeManifest = false): string[] {
  const normalizedCwd = normalizeWorkingPath(cwd)
  const registryDir = resolveRegistryBaseDir(normalizedCwd)
  const outputDir = getDefaultRegistryOutputDir(normalizedCwd)
  const schemaDir = path.join(registryDir, "schema")
  const schemaFile = path.join(registryDir, "schema.json")
  const mapFile = path.join(registryDir, "ui8kit.map.json")

  const targets = [outputDir, schemaDir, schemaFile, mapFile]
  if (includeManifest) {
    targets.push(path.join(normalizedCwd, "src", "registry.json"))
  }

  return targets
}

export function isSafePath(candidate: string, cwd: string): boolean {
  const resolvedCandidate = normalizeWorkingPath(candidate)
  const normalizedCwd = normalizeWorkingPath(cwd)
  return resolvedCandidate === normalizedCwd || resolvedCandidate.startsWith(`${normalizedCwd}${path.sep}`)
}

async function confirmDeletion(paths: string[]): Promise<boolean> {
  const { ok } = await prompts({
    type: "confirm",
    name: "ok",
    message: `Delete ${paths.length} path(s)?`,
    initial: false
  })
  return Boolean(ok)
}

async function removePath(target: string) {
  if (await fs.pathExists(target)) {
    await fs.remove(target)
    logger.info(`removed: ${target}`)
  }
}

export async function registryCleanCommand(options: RegistryCleanOptions = {}) {
  const cwd = normalizeWorkingPath(process.cwd())
  const targets = getRegistryCleanTargets(cwd, Boolean(options.all))
  const existing = []
  for (const target of targets) {
    if (isSafePath(target, cwd) && await fs.pathExists(target)) {
      existing.push(target)
    }
  }

  if (existing.length === 0) {
    logger.info("No generated registry artifacts found.")
    return
  }

  const uniqueTargets = [...new Set(existing)]
  if (options.dryRun) {
    logger.info("Dry run enabled. The following paths will be removed:")
    uniqueTargets.forEach((target) => logger.info(`  ${target}`))
    logger.info(`Total: ${uniqueTargets.length}`)
    return
  }

  if (!options.force && !await confirmDeletion(uniqueTargets)) {
    logger.warn("Registry cleanup was cancelled.")
    return
  }

  try {
    for (const target of uniqueTargets) {
      await removePath(target)
    }
    logger.success(`Removed ${uniqueTargets.length} registry artifact path(s).`)
  } catch (error) {
    handleError(error)
  }
}
