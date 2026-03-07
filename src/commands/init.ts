import chalk from "chalk"
import prompts from "prompts"
import ora, { type Ora } from "ora"
import { isViteProject, hasReact, findConfig, saveConfig, ensureDir } from "../utils/project.js"
import { Config, Component } from "../registry/schema.js"
import { SCHEMA_CONFIG, getCdnUrls, type RegistryType, type CdnResolutionOptions, type ImportStyle } from "../utils/schema-config.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { installDependencies } from "../utils/package-manager.js"
import path from "path"
import fs from "fs-extra"
import fetch from "node-fetch"
import { logger } from "../utils/logger.js"
import { handleError } from "../utils/errors.js"

interface InitOptions {
  yes?: boolean
  registry?: string
  registryUrl?: string
  registryVersion?: string
  strictCdn?: boolean
  importStyle?: ImportStyle
}

export interface InitConfigOptions {
  yes?: boolean
  registry?: string
  globalCss?: string
  aliasComponents?: string
  registryUrl?: string
  registryVersion?: string
  strictCdn?: boolean
  importStyle?: ImportStyle
}

const INIT_FETCH_TIMEOUT_MS = 10_000

async function fetchJsonFromRegistry<T>(url: string): Promise<T | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), INIT_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      return null
    }
    return await response.json() as T
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

function resolveImportStyle(rawImportStyle?: ImportStyle): ImportStyle {
  return rawImportStyle === "package" ? "package" : "alias"
}

export function buildInitConfig(options: InitConfigOptions): Config {
  const registryName = options.registry || SCHEMA_CONFIG.defaultRegistryType
  const aliases = SCHEMA_CONFIG.defaultAliases
  const globalCss = options.globalCss || "src/index.css"
  const aliasComponents = options.aliasComponents?.trim() || "@/components"
  const importStyle = resolveImportStyle(options.importStyle)

  if (options.yes) {
    return {
      $schema: `${SCHEMA_CONFIG.baseUrl}.json`,
      framework: "vite-react",
      typescript: true,
      globalCss,
      aliases,
      registry: SCHEMA_CONFIG.defaultRegistry,
      componentsDir: SCHEMA_CONFIG.defaultDirectories.components,
      libDir: SCHEMA_CONFIG.defaultDirectories.lib,
      registryUrl: options.registryUrl,
      registryVersion: options.registryVersion,
      strictCdn: options.strictCdn,
      importStyle
    }
  }

  return {
    $schema: `${SCHEMA_CONFIG.baseUrl}.json`,
    framework: "vite-react",
    typescript: true,
    globalCss,
    aliases: { ...aliases, "@/components": aliasComponents },
    registry: SCHEMA_CONFIG.defaultRegistry,
    componentsDir: SCHEMA_CONFIG.defaultDirectories.components,
    libDir: SCHEMA_CONFIG.defaultDirectories.lib,
    registryUrl: options.registryUrl,
    registryVersion: options.registryVersion,
    strictCdn: options.strictCdn,
    importStyle
  }
}

export async function initCommand(options: InitOptions) {
  const registryName = options.registry || SCHEMA_CONFIG.defaultRegistryType
  const cdnOptions: CdnResolutionOptions = {
    registryUrl: options.registryUrl,
    registryVersion: options.registryVersion,
    strictCdn: options.strictCdn
  }
  
  logger.info(CLI_MESSAGES.info.initializing(registryName))
  
  // Check if it's a Vite project
  const viteDetected = await isViteProject()
  if (!viteDetected) {
    console.error(chalk.red(`❌ ${CLI_MESSAGES.errors.notViteProject}`))
    console.log("Please run this command in a Vite project directory.")
    process.exit(1)
  }
  
  // Check if React is installed
  if (!(await hasReact())) {
    console.error(chalk.red(`❌ ${CLI_MESSAGES.errors.reactNotInstalled}`))
    console.log("Please install React first: npm install react react-dom")
    process.exit(1)
  }
  
  // Check if already initialized (root first, then backward-compatible locations)
  const existingConfig = await findConfig(registryName)
  if (existingConfig && !options.yes) {
    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: CLI_MESSAGES.prompts.overwrite(registryName),
      initial: false
    })
    
    if (!overwrite) {
      logger.warn(CLI_MESSAGES.info.installationCancelled)
      return
    }
  }

  let config: Config
  
  if (options.yes) {
    config = buildInitConfig({ yes: true, registry: registryName, ...cdnOptions, importStyle: options.importStyle })
  } else {
    const responses = await prompts([
      {
        type: "text",
        name: "globalCss",
        message: CLI_MESSAGES.prompts.globalCss,
        initial: "src/index.css"
      },
      {
        type: "text",
        name: "aliasComponents",
        message: CLI_MESSAGES.prompts.aliasComponents,
        initial: "@/components"
      },
      {
        type: "select",
        name: "importStyle",
        message: "Import style for installed components",
        choices: [
          { title: "Alias imports (recommended)", value: "alias" as ImportStyle },
          { title: "Package imports (@ui8kit/core)", value: "package" as ImportStyle }
        ],
        initial: 0
      }
    ])

    const aliasComponents = responses.aliasComponents?.trim() || "@/components"
    const globalCss = responses.globalCss || "src/index.css"
    const importStyle = resolveImportStyle(responses.importStyle)
    config = buildInitConfig({
      yes: false,
      registry: registryName,
      globalCss,
      aliasComponents,
      importStyle,
      ...cdnOptions
    })
  }
  
  const spinner = ora(CLI_MESSAGES.info.initializing(registryName)).start()
  
  try {
    // Save configuration at project root
    await saveConfig(config)
    
    spinner.text = "Installing core utilities and variants..."
    
    // Install utils and all variants from registry
    await installCoreFiles(registryName as RegistryType, config, spinner, cdnOptions)

    spinner.succeed(CLI_MESSAGES.success.initialized(registryName))
    
    logger.success(`\n✅ ${CLI_MESSAGES.success.setupComplete(registryName)}`)
    console.log("\nDirectories created:")
    console.log(`  ${chalk.cyan("src/lib/")} - Utils, helpers, functions`)
    console.log(`  ${chalk.cyan("src/variants/")} - CVA variant configurations`)
    console.log(`  ${chalk.cyan("src/components/ui/")} - UI components`)
    console.log(`  ${chalk.cyan("src/components/")} - Complex components`)
    console.log(`  ${chalk.cyan("src/layouts/")} - Page layouts and structures`)
    console.log(`  ${chalk.cyan("src/blocks/")} - Component blocks`)
    
    console.log("\nNext steps:")
    CLI_MESSAGES.examples.init.forEach(example => console.log(`  ${chalk.cyan(example)}`))

  } catch (error) {
    spinner.fail(CLI_MESSAGES.errors.buildFailed)
    handleError(error)
  }
}

interface RegistryIndex {
  components: Array<{ name: string; type: string }>
}

interface CoreComponentRef {
  name: string
  type: string
}

interface CoreComponentDescriptor extends CoreComponentRef {
  component: Component
}

function sortCoreDependencies(descriptors: CoreComponentDescriptor[]): CoreComponentDescriptor[] {
  const itemByTypeAndName = new Map<string, CoreComponentDescriptor>()
  for (const item of descriptors) {
    itemByTypeAndName.set(`${item.type}:${item.name}`, item)
  }

  const findDependencyByName = (name: string): CoreComponentDescriptor | undefined => {
    const dependencyByLib = itemByTypeAndName.get(`registry:lib:${name}`)
    if (dependencyByLib) {
      return dependencyByLib
    }
    return descriptors.find(item => item.name === name)
  }

  const indegrees = new Map<string, number>()
  const graph = new Map<string, Set<string>>()
  const queue: string[] = []

  for (const item of descriptors) {
    const key = `${item.type}:${item.name}`
    indegrees.set(key, 0)
    graph.set(key, new Set())
  }

  for (const item of descriptors) {
    const itemKey = `${item.type}:${item.name}`
    for (const registryDep of item.component.registryDependencies ?? []) {
      const targetName = registryDep.toLowerCase()
      const dependency = findDependencyByName(targetName)
      if (!dependency) {
        continue
      }
      const dependencyKey = `${dependency.type}:${dependency.name}`
      if (dependencyKey === itemKey) {
        continue
      }
      graph.get(dependencyKey)?.add(itemKey)
      indegrees.set(itemKey, (indegrees.get(itemKey) ?? 0) + 1)
    }
  }

  for (const [key, inDegree] of indegrees.entries()) {
    if (inDegree === 0) {
      queue.push(key)
    }
  }

  const result: CoreComponentDescriptor[] = []
  while (queue.length > 0) {
    const key = queue.shift()
    if (!key) break
    const item = itemByTypeAndName.get(key)
    if (!item) continue

    result.push(item)
    for (const dependent of graph.get(key) ?? []) {
      const nextDegree = Math.max((indegrees.get(dependent) ?? 1) - 1, 0)
      indegrees.set(dependent, nextDegree)
      if (nextDegree === 0) {
        queue.push(dependent)
      }
    }
  }

  if (result.length === descriptors.length) {
    return result
  }

  // Fallback to insertion order for unresolved/cyclic dependencies
  for (const item of descriptors) {
    if (!result.includes(item)) {
      result.push(item)
    }
  }
  return result
}

async function fetchCoreComponent(
  name: string,
  type: string,
  cdnUrls: string[]
): Promise<Component | null> {
  const folder = type === "registry:lib" ? "lib" : type === "registry:variants" ? "components/variants" : "components/ui"
  for (const baseUrl of cdnUrls) {
    const url = `${baseUrl}/${folder}/${name}.json`
    const component = await fetchJsonFromRegistry<Component>(url)
    if (component) {
      return component
    }
  }
  return null
}

function resolveComponentTargetDir(type: string, config: Config): string {
  if (type === "registry:lib") {
    return config.libDir
  }
  if (type === "registry:variants") {
    return SCHEMA_CONFIG.defaultDirectories.variants
  }
  return path.join(config.componentsDir, "ui")
}

async function writeComponentFromDescriptor(component: Component, type: string, config: Config): Promise<void> {
  for (const file of component.files) {
    const fileName = path.basename(file.path)
    const targetDir = resolveComponentTargetDir(type, config)
    const targetPath = path.join(process.cwd(), targetDir, fileName)
    await fs.ensureDir(path.dirname(targetPath))
    await fs.writeFile(targetPath, file.content || "", "utf-8")
  }
}

async function installCoreFiles(
  registryType: RegistryType,
  config: Config,
  spinner: Ora,
  cdnResolution: CdnResolutionOptions = {}
): Promise<void> {
  const cdnUrls = getCdnUrls(registryType, {
    registryUrl: cdnResolution.registryUrl,
    registryVersion: cdnResolution.registryVersion,
    strictCdn: cdnResolution.strictCdn
  })
  
  // Try to fetch registry index to get list of variants and utils
  let registryIndex: RegistryIndex | null = null
  
  for (const baseUrl of cdnUrls) {
    try {
      const indexUrl = `${baseUrl}/index.json`
      const indexData = await fetchJsonFromRegistry<RegistryIndex>(indexUrl)
      if (indexData) {
        registryIndex = indexData
        break
      }
    } catch {
      continue
    }
  }
  
  if (!registryIndex) {
    spinner.text = "⚠️  Could not fetch registry index, creating local utils..."
    // Fallback: create utils file locally
    await createUtilsFile(config.libDir, config.typescript)
    return
  }
  
  // Filter variants and lib items
  const variantItems = registryIndex.components.filter(c => c.type === "registry:variants")
  const libItems = registryIndex.components.filter(c => c.type === "registry:lib")
  const coreItems: CoreComponentRef[] = [
    ...libItems.map(item => ({ name: item.name, type: "registry:lib" })),
    ...variantItems.map(item => ({ name: item.name, type: "registry:variants" }))
  ]

  if (coreItems.length === 0) {
    spinner.text = "⚠️  Registry index has no core components; creating local utils..."
    await createUtilsFile(config.libDir, config.typescript)
    return
  }

  const loadedComponents: CoreComponentDescriptor[] = []
  const coreDependencies = new Set<string>()
  for (const item of coreItems) {
    spinner.text = `Fetching ${item.name}...`
    const component = await fetchCoreComponent(item.name, item.type, cdnUrls)
    if (!component) {
      continue
    }
    loadedComponents.push({
      ...item,
      component: {
        name: component.name || item.name,
        type: item.type,
        files: component.files,
        dependencies: component.dependencies ?? [],
        devDependencies: component.devDependencies ?? [],
        registryDependencies: component.registryDependencies ?? [],
        description: component.description
      }
    })
    for (const dep of component.dependencies ?? []) {
      coreDependencies.add(dep)
    }
  }

  const orderedCoreComponents = sortCoreDependencies(loadedComponents)
  for (const descriptor of orderedCoreComponents) {
    spinner.text = `Installing ${descriptor.name}...`
    await writeComponentFromDescriptor(descriptor.component, descriptor.type, config)
  }

  if (coreDependencies.size > 0) {
    spinner.text = "Installing core dependencies..."
    await installDependencies(Array.from(coreDependencies), {
      useSpinner: false
    })
  }
  
  // Install variants/index.ts
  spinner.text = "Syncing variants index..."
  const variantsIndexStatus = await installVariantsIndex(cdnUrls)
  if (variantsIndexStatus === "updated") {
    spinner.text = "Updated variants/index.ts from CDN"
  } else if (variantsIndexStatus === "created") {
    spinner.text = "Created variants/index.ts from CDN"
  } else if (variantsIndexStatus === "unchanged") {
    spinner.text = "variants/index.ts is up to date"
  } else {
    spinner.text = "variants/index.ts not found in registry (skipped)"
  }
  
  spinner.text = `✅ Installed ${loadedComponents.length} core components`
}

async function installVariantsIndex(cdnUrls: string[]): Promise<"created" | "updated" | "unchanged" | "skipped"> {
  for (const baseUrl of cdnUrls) {
    // Try to fetch index component from variants
    const url = `${baseUrl}/components/variants/index.json`
    const component = await fetchJsonFromRegistry<Component>(url)
    if (!component) {
      continue
    }

    for (const file of component.files) {
      const fileName = path.basename(file.path)
      if (!fileName.startsWith("index.")) {
        continue
      }

      const targetDir = SCHEMA_CONFIG.defaultDirectories.variants
      const targetPath = path.join(process.cwd(), targetDir, fileName)
      const incomingContent = file.content || ""
      const exists = await fs.pathExists(targetPath)

      if (exists) {
        const currentContent = await fs.readFile(targetPath, "utf-8")
        if (currentContent === incomingContent) {
          return "unchanged"
        }
      }

      await fs.ensureDir(path.dirname(targetPath))
      await fs.writeFile(targetPath, incomingContent, "utf-8")
      return exists ? "updated" : "created"
    }
  }

  return "skipped"
}

async function createUtilsFile(libDir: string, typescript: boolean): Promise<void> {
  const utilsContent = `import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}`

  const fileName = typescript ? "utils.ts" : "utils.js"
  const filePath = path.join(process.cwd(), libDir, fileName)
  
  await fs.writeFile(filePath, utilsContent, "utf-8")
}
