import path from "path"
import prompts from "prompts"
import { getComponent, getAllComponents } from "../registry/api.js"
import { findConfig } from "../utils/project.js"
import { Component, type Config } from "../registry/schema.js"
import { SCHEMA_CONFIG, type RegistryType, getCdnUrls, type CdnResolutionOptions } from "../utils/schema-config.js"
import { validateComponentInstallation, handleValidationError } from "../utils/registry-validator.js"
import { checkProjectDependencies, showDependencyStatus } from "../utils/dependency-checker.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { installDependencies } from "../utils/package-manager.js"
import { logger, Spinner } from "../utils/logger.js"
import { resolveRegistryTree } from "../utils/dependency-resolver.js"
import { handleError, ConfigNotFoundError } from "../utils/errors.js"
import { buildUnifiedDiff, formatDiffPreview, hasDiff } from "../utils/diff-utils.js"
import { applyTransforms, shouldTransformFile } from "../utils/transform.js"
import {
  inferTargetFromType,
  listInstallRoots,
  resolveFileInstallPath,
  resolveInstallDir,
} from "../utils/paths.js"
import { ensureDir } from "../utils/project.js"
import { ensureDir as fsEnsureDir, pathExists, readFile, writeFile } from "../utils/fs.js"
import { filterFilesForRuntime } from "../utils/runtime-files.js"

interface AddOptions {
  force?: boolean
  dryRun?: boolean
  all?: boolean
  retry?: boolean
  registry?: string
  cache?: boolean
  registryUrl?: string
  registryVersion?: string
  strictCdn?: boolean
  runtime?: string
}

const ADD_EXCLUDED_COMPONENT_TYPES = ["registry:variants", "registry:lib", "registry:utils"]

export { inferTargetFromType, resolveInstallDir }

export async function addCommand(components: string[], options: AddOptions) {
  const registryType = resolveRegistryType(options.registry)

  try {
    const config = await findConfig(registryType)
    if (!config) {
      throw new ConfigNotFoundError(registryType)
    }

    const cdnResolution: CdnResolutionOptions = {
      registryUrl: options.registryUrl || config.registryUrl,
      registryVersion: options.registryVersion || config.registryVersion,
      strictCdn: options.strictCdn ?? config.strictCdn,
      cdnBaseUrls: config.cdnBaseUrls,
    }
    const requestOptions = {
      excludeTypes: ADD_EXCLUDED_COMPONENT_TYPES,
      maxRetries: options.retry ? 3 : 1,
      noCache: options.cache === false,
      cdn: cdnResolution,
    }

    if (options.all || components.includes("all")) {
      await addAllComponents(options, registryType, requestOptions)
      return
    }

    const selectedComponents =
      components.length > 0 ? components : await pickComponentsFromPrompt(registryType, requestOptions)

    if (selectedComponents.length === 0) {
      logger.warn(CLI_MESSAGES.errors.noComponentsSpecified)
      return
    }

    const validation = await validateComponentInstallation(selectedComponents, registryType)
    if (!validation.isValid) {
      handleValidationError(validation)
    }

    if (options.retry) {
      logger.info(CLI_MESSAGES.info.retryEnabled)
    }

    logger.info(CLI_MESSAGES.info.installing(registryType))

    for (const root of listInstallRoots(config)) {
      await ensureDir(root)
    }

    const getComponentFn = (name: string, type: RegistryType) => getComponent(name, type, requestOptions)

    const results = await installRequestedComponents(
      selectedComponents,
      registryType,
      config,
      getComponentFn,
      options,
    )

    displayInstallationSummary(registryType, results)
  } catch (error) {
    handleError(error)
  }
}

async function addAllComponents(
  options: AddOptions,
  registryType: RegistryType,
  requestOptions: { excludeTypes: string[]; maxRetries: number; noCache?: boolean; cdn?: CdnResolutionOptions }
) {
  logger.info(CLI_MESSAGES.info.installingAll(registryType))

  const validation = await validateComponentInstallation([], registryType)
  if (!validation.isValid) {
    handleValidationError(validation)
  }

  const config = await findConfig(registryType)
  if (!config) {
    throw new ConfigNotFoundError(registryType)
  }

  const getAllComponentsFn = (type: RegistryType) => getAllComponents(type, requestOptions)

  if (options.retry) {
    logger.info(CLI_MESSAGES.info.retryEnabled)
  }

  const spinner = new Spinner(CLI_MESSAGES.info.fetchingComponentList(registryType)).start()

  try {
    if (!options.dryRun) {
      await ensureBaseProjectDirectories(config)
    }

    const allComponents = await getAllComponentsFn(registryType)

    if (allComponents.length === 0) {
      spinner.fail(`No components found in ${registryType} registry`)
      logger.warn(`\n⚠️  ${registryType} ${CLI_MESSAGES.errors.registryTempUnavailable}`)
      console.log("Try these alternatives:")
      CLI_MESSAGES.examples.troubleshooting.forEach(alt => console.log(`  • ${alt}`))
      return
    }

    spinner.succeed(CLI_MESSAGES.status.foundComponents(allComponents.length, registryType))

    if (options.dryRun) {
      await installRequestedComponents(
        allComponents.map(c => c.name),
        registryType,
        config,
        (name: string, type: RegistryType) => getComponent(name, type, requestOptions),
        options,
        allComponents
      )
      return
    }

    const results = await installRequestedComponents(
      allComponents.map(c => c.name),
      registryType,
      config,
      (name: string, type: RegistryType) => getComponent(name, type, requestOptions),
      options,
      allComponents
    )

    // Install components/index.ts when using --all
    await installComponentsIndex(registryType, config, requestOptions.cdn)

    displayInstallationSummary(registryType, results)

  } catch (error) {
    spinner.fail(CLI_MESSAGES.errors.failedToFetch(registryType))
    logger.error(`Error: ${(error as Error).message}`)
    logger.warn(`\n⚠️  ${registryType} ${CLI_MESSAGES.errors.registryTempUnavailable}`)
    console.log("Try these alternatives:")
    CLI_MESSAGES.examples.troubleshooting.forEach(alt => console.log(`  • ${alt}`))
    process.exit(1)
  }
}

async function ensureBaseProjectDirectories(config: Config): Promise<void> {
  for (const root of listInstallRoots(config)) {
    await fsEnsureDir(root)
  }
}

async function processComponents(
  componentNames: string[],
  registryType: RegistryType,
  config: Config,
  getComponentFn: (name: string, type: RegistryType) => Promise<Component | null>,
  options: AddOptions,
  preloadedComponents?: Component[],
  totalCount?: number
): Promise<Array<{ name: string; status: "success" | "error"; error?: string }>> {
  const results: Array<{ name: string; status: "success" | "error"; error?: string }> = []
  const componentMap = new Map(preloadedComponents?.map(c => [c.name.toLowerCase(), c]))
  const total = totalCount ?? componentNames.length

  if (total > 1) {
    logger.info(`Installing ${total} components...`)
  }

  for (let i = 0; i < componentNames.length; i += 1) {
    const componentName = componentNames[i]
    const position = `${i + 1}/${total}`
    const spinner = new Spinner(`[${position}] ${CLI_MESSAGES.status.installing(componentName, registryType)}`).start()

    try {
      const lookupName = componentName.toLowerCase()
      let component: Component | null = componentMap?.get(lookupName) ?? null

      if (!component) {
        component = await getComponentFn(componentName, registryType)
      }

      if (!component) {
        throw new Error(CLI_MESSAGES.errors.componentNotFound(componentName, registryType))
      }

      const preferredRuntime = options.runtime || config.runtime
      if (
        preferredRuntime &&
        component.runtime &&
        component.runtime !== preferredRuntime
      ) {
        spinner.info(
          `[${position}] skip ${component.name} (runtime ${component.runtime} ≠ ${preferredRuntime})`,
        )
        continue
      }

      const filesForRuntime = filterFilesForRuntime(component.files, preferredRuntime, {
        componentType: component.type,
      })

      if (preferredRuntime && filesForRuntime.length === 0) {
        spinner.info(
          `[${position}] skip ${component.name} (no files for runtime ${preferredRuntime})`,
        )
        continue
      }

      const componentForInstall = { ...component, files: filesForRuntime }

      if (options.dryRun) {
        spinner.succeed(`[${position}] ${CLI_MESSAGES.status.wouldInstall(component.name, registryType)}`)
        logger.info(`   Type: ${component.type}`)
        if (preferredRuntime) {
          logger.info(`   Runtime filter: ${preferredRuntime} (${filesForRuntime.length}/${component.files.length} files)`)
        }
        if (component.registryDependencies && component.registryDependencies.length > 0) {
          logger.info(`   Registry deps: ${component.registryDependencies.join(" -> ")}`)
        }
        logger.info(`   Files: ${filesForRuntime.length}`)
        logger.info(`   Dependencies: ${component.dependencies.join(", ") || "none"}`)

        for (const file of filesForRuntime) {
          const targetPath = path.join(
            process.cwd(),
            resolveFileInstallPath(file, component.type, config),
          )
          const fileName = path.basename(targetPath)
          const exists = await pathExists(targetPath)
          const status = exists ? "overwrite" : "create"
          logger.info(`   ${status}: ${targetPath}`)

          if (exists) {
            const currentContent = await readFile(targetPath, "utf-8")
            const transformedIncoming = shouldTransformFile(fileName)
              ? applyTransforms(file.content, config.aliases, config.importStyle || "alias")
              : file.content
            const changed = hasDiff(currentContent, transformedIncoming)
            if (changed) {
              const patch = buildUnifiedDiff(
                targetPath,
                `${component.name}/${fileName}`,
                currentContent,
                transformedIncoming,
              )
              console.log(formatDiffPreview(patch, 40))
            }
          }
        }

        if (component.dependencies.length > 0) {
          const depStatus = await checkProjectDependencies(component.dependencies)
          showDependencyStatus(depStatus)
        }
        continue
      }

      await installComponentFiles(componentForInstall, config, options.force)

      if (component.dependencies.length > 0) {
        try {
          await installDependencies(component.dependencies)
        } catch (error) {
          logger.warn(CLI_MESSAGES.errors.couldNotInstallDeps(component.name))
          logger.warn(`   Dependencies: ${component.dependencies.join(", ")}`)
          logger.warn("   Please install them manually if needed")
        }
      }

      spinner.succeed(`[${position}] ${CLI_MESSAGES.status.installing(component.name, registryType)}`)
      results.push({ name: component.name, status: "success" })

    } catch (error) {
      spinner.fail(`[${position}] ${CLI_MESSAGES.errors.failedToInstall(componentName, registryType)}`)
      logger.error(`   Error: ${(error as Error).message}`)
      results.push({
        name: componentName,
        status: "error",
        error: (error as Error).message
      })
    }
  }

  return results
}

async function pickComponentsFromPrompt(
  registryType: RegistryType,
  requestOptions: { excludeTypes: string[]; maxRetries: number }
): Promise<string[]> {
  const allComponents = await getAllComponents(registryType, requestOptions)
  if (allComponents.length === 0) {
    logger.warn(`No components found in ${registryType} registry`)
    return []
  }

  const sorted = allComponents
    .filter(component => !ADD_EXCLUDED_COMPONENT_TYPES.includes(component.type))
    .sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name)
      }
      return a.type.localeCompare(b.type)
    })

  const grouped = new Map<string, Component[]>()
  for (const component of sorted) {
    const group = grouped.get(component.type) ?? []
    group.push(component)
    if (!grouped.has(component.type)) {
      grouped.set(component.type, group)
    }
  }

  const choices: Array<{ title: string; value: string; description?: string; disabled?: boolean }> = []
  for (const [type, components] of grouped) {
    choices.push({
      title: `\n${type}`,
      value: "__separator__",
      description: "",
      disabled: true
    })

    for (const component of components) {
      choices.push({
        title: component.name,
        value: component.name,
        description: component.description || component.type
      })
    }
  }

  if (choices.length === 0) {
    logger.warn(`No selectable components found in ${registryType} registry`)
    return []
  }

  const { selected } = await prompts({
    type: "multiselect",
    name: "selected",
    message: "Which components would you like to add?",
    instructions: false,
    choices,
    hint: "Space to select, Enter to confirm"
  })

  return selected || []
}

async function installRequestedComponents(
  componentNames: string[],
  registryType: RegistryType,
  config: Config,
  getComponentFn: (name: string, type: RegistryType) => Promise<Component | null>,
  options: AddOptions,
  preloadedComponents: Component[] = []
): Promise<Array<{ name: string; status: "success" | "error"; error?: string }>> {
  const componentMap = new Map<string, Component>()
  for (const component of preloadedComponents) {
    componentMap.set(component.name.toLowerCase(), component)
  }

  const resolverGetComponent = async (name: string, type: RegistryType): Promise<Component | null> => {
    const normalized = name.toLowerCase()
    const cached = componentMap.get(normalized)
    if (cached) {
      return cached
    }

    const component = await getComponentFn(name, type)
    if (!component) {
      return null
    }

    componentMap.set(component.name.toLowerCase(), component)
    return component
  }

  const orderedComponents = await resolveRegistryTree(componentNames, registryType, (name, type) =>
    resolverGetComponent(name, type)
  )
  if (options.dryRun && orderedComponents.length > 0) {
    logger.info("\n📦 Resolved registry dependency tree:")
    orderedComponents.forEach((component, index) => {
      console.log(`   ${index + 1}. ${component.name}`)
    })
  }

  const orderedNames = new Set(orderedComponents.map(component => component.name.toLowerCase()))
  const normalizedRequested = Array.from(new Set(componentNames.map(name => name.toLowerCase())))
  const missingRequested = normalizedRequested.filter(name => !orderedNames.has(name))

  const missingResults = missingRequested.map(name => ({
    name,
    status: "error" as const,
    error: `Component "${name}" was not found in ${registryType} registry`
  }))

  const processingResults = await processComponents(
    orderedComponents.map(component => component.name),
    registryType,
    config,
    resolverGetComponent,
    options,
    orderedComponents,
    orderedComponents.length
  )
  return [...missingResults, ...processingResults]
}

function displayInstallationSummary(
  registryType: RegistryType,
  results: Array<{ name: string; status: "success" | "error" }>
) {
  const successful = results.filter(r => r.status === "success")
  const failed = results.filter(r => r.status === "error")

  logger.info("\n📊 Installation Summary:")
  console.log(`   Registry: ${registryType}`)
  console.log(`   ✅ Successful: ${successful.length}`)
  console.log(`   ❌ Failed: ${failed.length}`)

  if (successful.length > 0) {
    logger.success(`\n🎉 ${CLI_MESSAGES.success.componentsInstalled}`)
    console.log("You can now import and use them in your project.")
  }

  if (failed.length > 0) {
    process.exit(1)
  }
}

async function installComponentFiles(
  component: Component,
  config: Config,
  force = false,
): Promise<void> {
  for (const file of component.files) {
    const relative = resolveFileInstallPath(file, component.type, config)
    const targetPath = path.join(process.cwd(), relative)
    const fileName = path.basename(targetPath)

    if (!force && (await pathExists(targetPath))) {
      console.log(`   ⚠️  ${CLI_MESSAGES.status.skipped(fileName)}`)
      continue
    }

    await fsEnsureDir(path.dirname(targetPath))
    const preparedContent = shouldTransformFile(fileName)
      ? applyTransforms(file.content, config.aliases, config.importStyle || "alias")
      : file.content
    await writeFile(targetPath, preparedContent, "utf-8")
  }
}

function resolveRegistryType(registryInput?: string): RegistryType {
  if (!registryInput) {
    return SCHEMA_CONFIG.defaultRegistryType
  }

  if (SCHEMA_CONFIG.registryTypes.includes(registryInput as any)) {
    return registryInput as RegistryType
  }

  logger.warn(`⚠️  Unknown registry type: ${registryInput}`)
  console.log(`Available registries: ${SCHEMA_CONFIG.registryTypes.join(", ")}`)
  console.log(`Using default: ${SCHEMA_CONFIG.defaultRegistryType}`)

  return SCHEMA_CONFIG.defaultRegistryType
}

async function installComponentsIndex(
  registryType: RegistryType,
  config: Config,
  cdnResolution: CdnResolutionOptions = {},
): Promise<void> {
  const spinner = new Spinner("Installing components index...").start()

  try {
    const cdnUrls = getCdnUrls(registryType, cdnResolution)

    for (const baseUrl of cdnUrls) {
      try {
        const url = `${baseUrl}/components/index.json`
        const response = await fetch(url)

        if (response.ok) {
          const component = (await response.json()) as Component
          await installComponentFiles(
            { ...component, type: component.type || "registry:component" },
            config,
            true,
          )
          spinner.succeed("Installed components index")
          return
        }
      } catch {
        continue
      }
    }

    spinner.info("Components index not found in registry (optional)")
  } catch {
    spinner.fail("Could not install components index")
  }
}
