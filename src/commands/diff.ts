import fs from "fs-extra"
import path from "path"
import { glob } from "glob"
import chalk from "chalk"
import { findConfig } from "../utils/project.js"
import { Component, Config } from "../registry/schema.js"
import { getAllComponents } from "../registry/api.js"
import { buildUnifiedDiff, formatDiffPreview, hasDiff } from "../utils/diff-utils.js"
import { applyTransforms } from "../utils/transform.js"
import { SCHEMA_CONFIG, type RegistryType } from "../utils/schema-config.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { logger } from "../utils/logger.js"
import { handleError } from "../utils/errors.js"

interface DiffOptions {
  registry?: string
  json?: boolean
  cache?: boolean
}

interface ScannedLocalComponent {
  name: string
  filePath: string
}

interface ComponentDiffSummary {
  component: string
  type: string
  status: "up-to-date" | "update" | "missing-remote" | "missing-local"
  files: Array<{ path: string; changed: boolean; diff?: string }>
}

export async function diffCommand(componentName?: string, options: DiffOptions = {}) {
  try {
    const registryType = resolveRegistryType(options.registry)
    const config = await findConfig(registryType)
    const defaultConfig: Config = config ?? {
      framework: SCHEMA_CONFIG.supportedFrameworks[0],
      typescript: true,
      globalCss: "src/index.css",
      aliases: SCHEMA_CONFIG.defaultAliases,
      registry: SCHEMA_CONFIG.defaultRegistry,
      componentsDir: SCHEMA_CONFIG.defaultDirectories.components,
      libDir: SCHEMA_CONFIG.defaultDirectories.lib
    }

    const installed = await scanLocalComponents(defaultConfig)
    if (installed.length === 0) {
      logger.warn(CLI_MESSAGES.errors.noLocalInstall)
      return
    }

    const registryComponents = await getAllComponents(registryType, { noCache: options.cache === false })
    const registryIndex = new Map(registryComponents.map(item => [item.name.toLowerCase(), item]))

    const targets = componentName
      ? installed.filter(item => item.name.toLowerCase() === componentName.toLowerCase())
      : installed

    if (componentName && targets.length === 0) {
      logger.warn(`Component "${componentName}" not found in local project structure`)
      return
    }

    const results: ComponentDiffSummary[] = []
    logger.info(CLI_MESSAGES.info.checkingForUpdates)
    for (const item of targets) {
      const remoteComponent = registryIndex.get(item.name.toLowerCase())
      if (!remoteComponent) {
        results.push({
          component: item.name,
          type: "unknown",
          status: "missing-remote",
          files: [{ path: item.filePath, changed: false }]
        })
        continue
      }

      const fileSummary = await compareComponentFiles(item, remoteComponent, defaultConfig)
      const hasChanges = fileSummary.some(file => file.changed)
      results.push({
        component: item.name,
      type: remoteComponent.type,
        status: hasChanges ? "update" : "up-to-date",
        files: fileSummary
      })
    }

    if (options.json) {
      console.log(JSON.stringify(results, null, 2))
      return
    }

    const updates = results.filter(item => item.status === "update").length
    const upToDate = results.filter(item => item.status === "up-to-date").length

    for (const result of results) {
      if (result.status === "missing-remote") {
        logger.warn(`\n⚠️  ${result.component}: not found in registry`)
        continue
      }

      const statusTitle = result.status === "update"
        ? `${chalk.yellow("UPDATE")}`
        : chalk.green("UP-TO-DATE")
      const title = `${statusTitle} ${result.component} (${result.type})`
      logger.info(title)

      for (const file of result.files) {
        console.log(`  ${chalk.white(file.path)}`)
        if (file.changed && file.diff) {
          const preview = formatDiffPreview(file.diff, 120)
          console.log(colorDiff(preview))
        } else {
          console.log(chalk.dim("  No changes"))
        }
      }
    }

    console.log(
      `\n${CLI_MESSAGES.info.localDiffSummary} ${chalk.yellow(updates)} component(s) have updates, ${chalk.green(upToDate)} up to date`
    )

    if (updates > 0) {
      console.log('Run "ui8kit add <component> --force" to update.')
    }
  } catch (error) {
    handleError(error)
  }
}

async function compareComponentFiles(
  installed: ScannedLocalComponent,
  remote: Component,
  config: Config
): Promise<Array<{ path: string; changed: boolean; diff?: string }>> {
  const localContent = await fs.readFile(installed.filePath, "utf-8")
  const remoteCandidate = remote.files.find(file => {
    const candidateName = path.basename(file.path)
    return candidateName.toLowerCase() === path.basename(installed.filePath).toLowerCase()
  })

  if (!remoteCandidate) {
    return [{ path: installed.filePath, changed: false }]
  }

  const remoteContent = applyTransforms(remoteCandidate.content, config.aliases)
  const changed = hasDiff(localContent, remoteContent)
  return changed
    ? [{
        path: installed.filePath,
        changed: true,
        diff: buildUnifiedDiff(installed.filePath, `${remote.name}/${path.basename(installed.filePath)}`, localContent, remoteContent)
      }]
    : [{ path: installed.filePath, changed: false }]
}

async function scanLocalComponents(config: Config): Promise<ScannedLocalComponent[]> {
  const componentsDir = path.resolve(process.cwd(), config.componentsDir || SCHEMA_CONFIG.defaultDirectories.components)
  const componentsUiDir = path.join(componentsDir, "ui")
  const blocksDir = path.resolve(process.cwd(), SCHEMA_CONFIG.defaultDirectories.blocks)
  const layoutsDir = path.resolve(process.cwd(), SCHEMA_CONFIG.defaultDirectories.layouts)

  const directories = [componentsUiDir, componentsDir, blocksDir, layoutsDir]
  const entries: ScannedLocalComponent[] = []
  const patterns = directories.map(dir => path.join(dir, "*.{ts,tsx}").replace(/\\/g, "/"))

  for (const pattern of patterns) {
    const baseDir = path.dirname(pattern)
    if (!(await fs.pathExists(baseDir))) {
      continue
    }

    const filePaths = await glob(pattern, { windowsPathsNoEscape: true })
    for (const filePath of filePaths) {
      const fileName = path.basename(filePath)
      if (fileName === "index.tsx" || fileName === "index.ts") {
        continue
      }
      entries.push({
        name: path.parse(fileName).name.toLowerCase(),
        filePath: path.resolve(process.cwd(), filePath)
      })
    }
  }

  const uniqueByName = new Map<string, ScannedLocalComponent>()
  for (const entry of entries) {
    if (!uniqueByName.has(entry.name)) {
      uniqueByName.set(entry.name, entry)
    }
  }
  return Array.from(uniqueByName.values())
}

function colorDiff(value: string): string {
  return value
    .split("\n")
    .map(line => {
      if (line.startsWith("+")) {
        return chalk.green(line)
      }
      if (line.startsWith("-")) {
        return chalk.red(line)
      }
      return line
    })
    .join("\n")
}

function resolveRegistryType(registryInput?: string): RegistryType {
  if (!registryInput) {
    return SCHEMA_CONFIG.defaultRegistryType
  }

  if (SCHEMA_CONFIG.registryTypes.includes(registryInput as RegistryType)) {
    return registryInput as RegistryType
  }

  logger.warn(`⚠️  Unknown registry type: ${registryInput}`)
  logger.warn(`Available registries: ${SCHEMA_CONFIG.registryTypes.join(", ")}`)
  return SCHEMA_CONFIG.defaultRegistryType
}

