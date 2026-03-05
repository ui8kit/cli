import ora from "ora"
import path from "path"
import fs from "fs-extra"
import fetch from "node-fetch"
import prompts from "prompts"
import { getComponent, getAllComponents } from "../registry/api.js"
import { findConfig } from "../utils/project.js"
import { Component, type Config } from "../registry/schema.js"
import { SCHEMA_CONFIG, type RegistryType } from "../utils/schema-config.js"
import { validateComponentInstallation, handleValidationError } from "../utils/registry-validator.js"
import { checkProjectDependencies, showDependencyStatus } from "../utils/dependency-checker.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { installDependencies } from "../utils/package-manager.js"
import { logger } from "../utils/logger.js"
import { resolveRegistryTree } from "../utils/dependency-resolver.js"
import { handleError, ConfigNotFoundError } from "../utils/errors.js"
import { buildUnifiedDiff, formatDiffPreview, hasDiff } from "../utils/diff-utils.js"
import { applyTransforms, shouldTransformFile } from "../utils/transform.js"

interface AddOptions {
  force?: boolean
  dryRun?: boolean
  all?: boolean
  retry?: boolean
  registry?: string
  cache?: boolean
}

const ADD_EXCLUDED_COMPONENT_TYPES = ["registry:variants", "registry:lib"]

export async function addCommand(components: string[], options: AddOptions) {
  const registryType = resolveRegistryType(options.registry)
  const requestOptions = {
    excludeTypes: ADD_EXCLUDED_COMPONENT_TYPES,
    maxRetries: options.retry ? 3 : 1,
    noCache: options.cache === false
  }

  try {
    if (options.all || components.includes("all")) {
      await addAllComponents(options, registryType, requestOptions)
      return
    }

    const selectedComponents = components.length > 0
      ? components
      : await pickComponentsFromPrompt(registryType, requestOptions)

    if (selectedComponents.length === 0) {
      logger.warn(CLI_MESSAGES.errors.noComponentsSpecified)
      return
    }

    const validation = await validateComponentInstallation(selectedComponents, registryType)
    if (!validation.isValid) {
      handleValidationError(validation)
    }

    const config = await findConfig(registryType)
    if (!config) {
      throw new ConfigNotFoundError(registryType)
    }

    if (options.retry) {
      logger.info(CLI_MESSAGES.info.retryEnabled)
    }

    logger.info(CLI_MESSAGES.info.installing(registryType))

    const getComponentFn = (name: string, type: RegistryType) =>
      getComponent(name, type, requestOptions)

    const results = await installRequestedComponents(
      selectedComponents,
      registryType,
      config,
      getComponentFn,
      options
    )

    displayInstallationSummary(registryType, results)
  } catch (error) {
    handleError(error)
  }
}

async function addAllComponents(
  options: AddOptions,
  registryType: RegistryType,
  requestOptions: { excludeTypes: string[]; maxRetries: number }
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
  
  const spinner = ora(CLI_MESSAGES.info.fetchingComponentList(registryType)).start()
  
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
    await installComponentsIndex(registryType, config)
    
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
  getComponentFn: (name: string, type: RegistryType) => Promise<Component | null>,
  options: AddOptions,
  preloadedComponents?: Component[]
): Promise<Array<{ name: string; status: "success" | "error"; error?: string }>> {
  const results: Array<{ name: string; status: "success" | "error"; error?: string }> = []
  const componentMap = new Map(preloadedComponents?.map(c => [c.name.toLowerCase(), c]))
  
  for (const componentName of componentNames) {
    const spinner = ora(CLI_MESSAGES.status.installing(componentName, registryType)).start()
    
    try {
      const lookupName = componentName.toLowerCase()
      let component: Component | null = componentMap?.get(lookupName) ?? null
      
      if (!component) {
        component = await getComponentFn(componentName, registryType)
      }
      
      if (!component) {
        throw new Error(CLI_MESSAGES.errors.componentNotFound(componentName, registryType))
      }
      
      if (options.dryRun) {
        spinner.succeed(CLI_MESSAGES.status.wouldInstall(component.name, registryType))
        logger.info(`   Type: ${component.type}`)
        if (component.registryDependencies && component.registryDependencies.length > 0) {
          logger.info(`   Registry deps: ${component.registryDependencies.join(" -> ")}`)
        }
        logger.info(`   Files: ${component.files.length}`)
        logger.info(`   Dependencies: ${component.dependencies.join(", ") || "none"}`)
        
        for (const file of component.files) {
          const fileName = path.basename(file.path)
          const target = file.target || inferTargetFromType(component.type)
          const installDir = resolveInstallDir(target, config)
          const targetPath = path.join(process.cwd(), installDir, fileName)
          const exists = await fs.pathExists(targetPath)
          const status = exists ? "overwrite" : "create"
          logger.info(`   ${status}: ${targetPath}`)
          
          if (exists) {
            const currentContent = await fs.readFile(targetPath, "utf-8")
            const transformedIncoming = shouldTransformFile(fileName)
              ? applyTransforms(file.content, config.aliases)
              : file.content
            const changed = hasDiff(currentContent, transformedIncoming)
            if (changed) {
              const patch = buildUnifiedDiff(targetPath, `${component.name}/${fileName}`, currentContent, transformedIncoming)
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
      
      await installComponentFiles(component, config, options.force)
      
      if (component.dependencies.length > 0) {
        try {
          await installDependencies(component.dependencies)
        } catch (error) {
          logger.warn(CLI_MESSAGES.errors.couldNotInstallDeps(component.name))
          logger.warn(`   Dependencies: ${component.dependencies.join(", ")}`)
          logger.warn("   Please install them manually if needed")
        }
      }
      
      spinner.succeed(CLI_MESSAGES.status.installing(component.name, registryType))
      results.push({ name: component.name, status: "success" })
      
    } catch (error) {
      spinner.fail(CLI_MESSAGES.errors.failedToInstall(componentName, registryType))
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
    orderedComponents
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
  force = false
): Promise<void> {
  for (const file of component.files) {
    const fileName = path.basename(file.path)

    const target = file.target || inferTargetFromType(component.type)
    const installDir = resolveInstallDir(target, config)
    const targetPath = path.join(process.cwd(), installDir, fileName)

    if (!force && await fs.pathExists(targetPath)) {
      console.log(`   ⚠️  ${CLI_MESSAGES.status.skipped(fileName)}`) 
      continue
    }

    await fs.ensureDir(path.dirname(targetPath))
    const preparedContent = shouldTransformFile(fileName)
      ? applyTransforms(file.content, config.aliases)
      : file.content
    await fs.writeFile(targetPath, preparedContent, "utf-8")
  }
}

function inferTargetFromType(componentType: string): string {
  switch (componentType) {
    case "registry:ui":
      return "ui"
    case "registry:composite":
      return "components"
    case "registry:block":
      return "blocks"
    case "registry:component":
      return "components"
    case "registry:layout":
      return "layouts"
    case "registry:lib":
      return "lib"
    case "registry:variants":
      return "variants"
    default:
      return "components"
  }
}

function resolveInstallDir(target: string, config: Config): string {
  const normalizedTarget = target.replace(/\\/g, "/").replace(/^\/?src\//i, "")

  // lib has own root at src/lib
  if (normalizedTarget === "lib") {
    return normalizeDir(config.libDir || SCHEMA_CONFIG.defaultDirectories.lib)
  }

  // variants has own root at src/variants
  if (normalizedTarget === "variants") {
    return normalizeDir(SCHEMA_CONFIG.defaultDirectories.variants)
  }

  const baseComponentsDir = normalizeDir(config.componentsDir || SCHEMA_CONFIG.defaultDirectories.components)

  // Composite targets like "components/ui" → parent(src) + target
  if (normalizedTarget.includes("/")) {
    const parentRoot = baseComponentsDir.replace(/[/\\]components$/i, "") || "src"
    return path.join(parentRoot, normalizedTarget).replace(/\\/g, "/")
  }

  if (normalizedTarget === "ui") return path.join(baseComponentsDir, "ui").replace(/\\/g, "/")
  if (normalizedTarget === "components") return baseComponentsDir

  switch (normalizedTarget) {
    case "blocks":
      return normalizeDir(SCHEMA_CONFIG.defaultDirectories.blocks)
    case "layouts":
      return normalizeDir(SCHEMA_CONFIG.defaultDirectories.layouts)
    default:
      return baseComponentsDir
  }
}

function normalizeDir(dir: string): string {
  return dir.replace(/^\.\//, "").replace(/\\/g, "/")
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

async function installComponentsIndex(registryType: RegistryType, config: Config): Promise<void> {
  const spinner = ora("Installing components index...").start()
  
  try {
    const cdnUrls = SCHEMA_CONFIG.cdnBaseUrls
    
    for (const baseUrl of cdnUrls) {
      try {
        const url = `${baseUrl}/components/index.json`
        const response = await fetch(url)
        
        if (response.ok) {
          const component = await response.json() as Component
          
          for (const file of component.files) {
            const fileName = path.basename(file.path)
            const targetDir = config.componentsDir
            const targetPath = path.join(process.cwd(), targetDir, fileName)
            await fs.ensureDir(path.dirname(targetPath))
            await fs.writeFile(targetPath, file.content || "", "utf-8")
          }
          
          spinner.succeed("Installed components index")
          return
        }
      } catch {
        continue
      }
    }
    
    spinner.info("Components index not found in registry (optional)")
  } catch (error) {
    spinner.fail("Could not install components index")
  }
} 