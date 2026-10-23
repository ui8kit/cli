import path from "path"
import prompts from "prompts"
import { getComponent, getAllComponents, getComponentSource } from "../registry/api.js"
import { findConfig } from "../utils/project.js"
import { Component, type Config } from "../registry/schema.js"
import { SCHEMA_CONFIG, type RegistryType, getCdnUrls, type CdnResolutionOptions } from "../utils/schema-config.js"
import { validateComponentInstallation, handleValidationError } from "../utils/registry-validator.js"
import { checkProjectDependencies, showDependencyStatus } from "../utils/dependency-checker.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { installDependencies } from "../utils/package-manager.js"
import { logger, Spinner } from "../utils/logger.js"
import { normalizeDependencyName, resolveRegistryTreeDetailed } from "../utils/dependency-resolver.js"
import { handleError, ConfigNotFoundError } from "../utils/errors.js"
import { buildUnifiedDiff, formatDiffPreview, hasDiff } from "../utils/diff-utils.js"
import { planItemFiles, type PlannedFile } from "../utils/install-plan.js"
import { exactVersion, updateLock, type LockEntryInput } from "../utils/lock.js"
import {
  inferTargetFromType,
  resolveFileInstallPath,
  resolveInstallDir,
} from "../utils/paths.js"
import { applyPathOverrides, assertInsideRoot } from "../utils/paths.js"
import { ensureDir as fsEnsureDir, pathExists, readFile, writeFile } from "../utils/fs.js"
import { assertKnownRuntime } from "../utils/runtime-files.js"
import { collectToolchainHints, isServerRuntime, printToolchainHints } from "../utils/server-runtime.js"

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
  /** Repeatable `--path key=dir` overrides (highest precedence, see docs/configuration.md). */
  path?: string[]
  /** Internal: resolved CDN options (fallback lock source for items without provenance). */
  cdnResolution?: CdnResolutionOptions
}

/**
 * Hidden from catalogs only (interactive picker, `--all`). Never applied to
 * explicit names or `registryDependencies`, so `utils` and `lib/*` resolve.
 */
const ADD_EXCLUDED_COMPONENT_TYPES = ["registry:variants", "registry:lib", "registry:utils", "registry:rules"]

/** Options for fetching a single item by name: no catalog exclusions. */
function fetchOptions<T extends { excludeTypes: string[]; cdn?: CdnResolutionOptions }>(requestOptions: T, registryBase?: string): T {
  if (!registryBase) return { ...requestOptions, excludeTypes: [] }
  // Bare-name deps of an item fetched by URL: that item's registry only (strict, no fallback).
  return {
    ...requestOptions,
    excludeTypes: [],
    cdn: { registryUrl: registryBase, strictCdn: true, runtime: requestOptions.cdn?.runtime },
  }
}

/** Types installed as shared foundations: never overwritten when pulled in as a dependency. */
const SHARED_FOUNDATION_TYPES = new Set(["registry:utils", "registry:lib"])

export { inferTargetFromType, resolveInstallDir }

/** Items that exist only in `r/react` (React Slot / `asChild`). */
export const REACT_ONLY_ITEMS = new Set(["slot"])

/** Drop React-only items for a non-React runtime, with a clear message (no silent "not found"). */
export function dropReactOnlyItems(names: string[], runtime?: string): string[] {
  if (!runtime || runtime === "react") return names
  return names.filter((name) => {
    if (!REACT_ONLY_ITEMS.has(name.trim().toLowerCase())) return true
    logger.error(
      `"${name}" is React-only (Slot / asChild, shipped only in r/react); runtime "${runtime}" has no ${name} item. ` +
        `Composition in ${runtime} uses its native mechanism (slots/children); use --runtime react for Slot.`,
    )
    return false
  })
}

export async function addCommand(components: string[], options: AddOptions) {
  const registryType = resolveRegistryType(options.registry)

  try {
    const loadedConfig = await findConfig(registryType)
    if (!loadedConfig) {
      throw new ConfigNotFoundError(registryType)
    }
    const config = applyPathOverrides(loadedConfig, options.path)
    assertKnownRuntime(options.runtime)
    assertKnownRuntime(config.runtime, "config runtime")

    const cdnResolution: CdnResolutionOptions = {
      registryUrl: options.registryUrl || config.registryUrl,
      registryVersion: options.registryVersion || config.registryVersion,
      strictCdn: options.strictCdn ?? config.strictCdn,
      cdnBaseUrls: config.cdnBaseUrls,
      runtime: options.runtime || config.runtime,
    }
    options.cdnResolution = cdnResolution
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

    const requested =
      components.length > 0 ? components : await pickComponentsFromPrompt(registryType, requestOptions)
    const selectedComponents = dropReactOnlyItems(requested, cdnResolution.runtime)
    if (requested.length > 0 && selectedComponents.length === 0) {
      process.exitCode = 1
      return
    }

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

    const getComponentFn = (name: string, type: RegistryType, base?: string) => getComponent(name, type, fetchOptions(requestOptions, base))

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

  const loadedConfig = await findConfig(registryType)
  if (!loadedConfig) {
    throw new ConfigNotFoundError(registryType)
  }
  const config = applyPathOverrides(loadedConfig, options.path)

  const getAllComponentsFn = (type: RegistryType) => getAllComponents(type, requestOptions)

  if (options.retry) {
    logger.info(CLI_MESSAGES.info.retryEnabled)
  }

  const spinner = new Spinner(CLI_MESSAGES.info.fetchingComponentList(registryType)).start()

  try {
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
        (name: string, type: RegistryType, base?: string) => getComponent(name, type, fetchOptions(requestOptions, base)),
        options,
        allComponents
      )
      return
    }

    const results = await installRequestedComponents(
      allComponents.map(c => c.name),
      registryType,
      config,
      (name: string, type: RegistryType, base?: string) => getComponent(name, type, fetchOptions(requestOptions, base)),
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

async function processComponents(
  componentNames: string[],
  registryType: RegistryType,
  config: Config,
  getComponentFn: (name: string, type: RegistryType, base?: string) => Promise<Component | null>,
  options: AddOptions,
  preloadedComponents?: Component[],
  totalCount?: number,
  explicitNames?: ReadonlySet<string>,
  lockEntries?: LockEntryInput[],
  installed?: Component[],
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
      // Index-aligned preloaded list first: two registries may ship items with the same name.
      const aligned = preloadedComponents?.[i]
      let component: Component | null =
        (aligned && aligned.name === componentName ? aligned : null) ?? componentMap?.get(lookupName) ?? null

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

      const planned = planItemFiles(component, config, preferredRuntime)

      if (preferredRuntime && planned.length === 0) {
        spinner.info(
          `[${position}] skip ${component.name} (no files for runtime ${preferredRuntime})`,
        )
        continue
      }

      if (options.dryRun) {
        spinner.succeed(`[${position}] ${CLI_MESSAGES.status.wouldInstall(component.name, registryType)}`)
        logger.info(`   Type: ${component.type}`)
        if (preferredRuntime) {
          logger.info(`   Runtime filter: ${preferredRuntime} (${planned.length}/${component.files.length} files)`)
        }
        if (component.registryDependencies && component.registryDependencies.length > 0) {
          logger.info(`   Registry deps: ${component.registryDependencies.join(" -> ")}`)
        }
        logger.info(`   Files: ${planned.length}`)
        logger.info(`   Dependencies: ${component.dependencies.join(", ") || "none"}`)

        for (const { rel, content: transformedIncoming } of planned) {
          const targetPath = path.resolve(process.cwd(), rel)
          const fileName = path.basename(targetPath)
          const exists = await pathExists(targetPath)
          const status = exists ? "overwrite" : "create"
          logger.info(`   ${status}: ${targetPath}`)

          if (exists) {
            const currentContent = await readFile(targetPath, "utf-8")
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

      // utils/lib pulled in as a dependency are installed only if missing (user edits are kept, even with --force).
      const pulledIn =
        SHARED_FOUNDATION_TYPES.has(component.type) &&
        explicitNames !== undefined &&
        !explicitNames.has(component.name.toLowerCase())
      const lockFiles = await installPlannedFiles(planned, options.force && !pulledIn, { quiet: pulledIn })
      if (lockEntries) {
        const source = getComponentSource(component)
        lockEntries.push({
          name: component.name,
          type: component.type,
          source: source?.base ?? getCdnUrls(SCHEMA_CONFIG.defaultRegistryType, options.cdnResolution)[0] ?? "unknown",
          version: exactVersion(component.digest, source?.indexVersion),
          runtime: component.runtime ?? preferredRuntime,
          files: lockFiles,
        })
      }

      installed?.push(component)
      // Server runtimes (templ/latte/twig/jinja2): toolchain deps come from `meta`, never npm.
      const serverItem = isServerRuntime(component.runtime ?? preferredRuntime)
      if (serverItem && component.dependencies.length > 0) {
        logger.warn(`   ${component.name}: npm dependencies ignored for server runtime (${component.dependencies.join(", ")})`)
      } else if (component.dependencies.length > 0) {
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
  getComponentFn: (name: string, type: RegistryType, base?: string) => Promise<Component | null>,
  options: AddOptions,
  preloadedComponents: Component[] = []
): Promise<Array<{ name: string; status: "success" | "error"; error?: string }>> {
  const componentMap = new Map<string, Component>()
  for (const component of preloadedComponents) {
    componentMap.set(component.name.toLowerCase(), component)
  }

  const resolverGetComponent = async (name: string, type: RegistryType, base?: string): Promise<Component | null> => {
    // Preloaded catalog entries belong to the active registry only.
    if (!base) {
      const cached = componentMap.get(name.toLowerCase())
      if (cached) return cached
    }
    return getComponentFn(name, type, base)
  }

  const resolved = await resolveRegistryTreeDetailed(componentNames, registryType, resolverGetComponent)
  const orderedComponents = resolved.components
  if (options.dryRun && orderedComponents.length > 0) {
    logger.info("\n📦 Resolved registry dependency tree:")
    orderedComponents.forEach((component, index) => {
      console.log(`   ${index + 1}. ${component.name}`)
    })
  }

  const normalizedRequested = Array.from(new Set(componentNames.map(name => name.toLowerCase())))
  const missingRequested = Array.from(new Set(resolved.missing.map(name => name.toLowerCase())))

  const missingResults = missingRequested.map(name => ({
    name,
    status: "error" as const,
    error: `Component "${name}" was not found in ${registryType} registry`
  }))

  const explicitNames = new Set(normalizedRequested.map(normalizeDependencyName))
  const lockEntries: LockEntryInput[] = []
  const installed: Component[] = []
  const processingResults = await processComponents(
    orderedComponents.map(component => component.name),
    registryType,
    config,
    resolverGetComponent,
    options,
    orderedComponents,
    orderedComponents.length,
    explicitNames,
    lockEntries,
    installed,
  )
  if (!options.dryRun) {
    try {
      await updateLock(lockEntries)
    } catch (error) {
      logger.warn(`Could not update ui8kit.lock.json: ${(error as Error).message}`)
    }
    printToolchainHints(collectToolchainHints(installed, config), logger)
  }
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

/**
 * Write planned files (existing files are kept unless `force`). Returns what the lock should record:
 * written files, plus kept files whose content already equals the planned content.
 */
async function installPlannedFiles(
  planned: PlannedFile[],
  force = false,
  opts: { quiet?: boolean } = {},
): Promise<Array<{ rel: string; content: string }>> {
  const record: Array<{ rel: string; content: string }> = []
  for (const { rel, content } of planned) {
    const targetPath = assertInsideRoot(process.cwd(), rel)
    if (!force && (await pathExists(targetPath))) {
      if (!opts.quiet) console.log(`   ⚠️  ${CLI_MESSAGES.status.skipped(path.basename(targetPath))}`)
      const current = await readFile(targetPath, "utf-8")
      if (current.replace(/\r\n/g, "\n") === content.replace(/\r\n/g, "\n")) record.push({ rel, content })
      continue
    }
    await fsEnsureDir(path.dirname(targetPath))
    await writeFile(targetPath, content, "utf-8")
    record.push({ rel, content })
  }
  return record
}

async function installComponentFiles(
  component: Component,
  config: Config,
  force = false,
  opts: { quiet?: boolean } = {},
): Promise<void> {
  await installPlannedFiles(planItemFiles(component, config), force, opts)
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
