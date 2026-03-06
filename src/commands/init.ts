import chalk from "chalk"
import prompts from "prompts"
import ora, { type Ora } from "ora"
import { isViteProject, hasReact, findConfig, saveConfig, ensureDir } from "../utils/project.js"
import { Config, Component } from "../registry/schema.js"
import { SCHEMA_CONFIG, getCdnUrls, type RegistryType, type CdnResolutionOptions } from "../utils/schema-config.js"
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
}

export interface InitConfigOptions {
  yes?: boolean
  registry?: string
  globalCss?: string
  aliasComponents?: string
  registryUrl?: string
  registryVersion?: string
  strictCdn?: boolean
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

export function buildInitConfig(options: InitConfigOptions): Config {
  const registryName = options.registry || SCHEMA_CONFIG.defaultRegistryType
  const aliases = SCHEMA_CONFIG.defaultAliases
  const globalCss = options.globalCss || "src/index.css"
  const aliasComponents = options.aliasComponents?.trim() || "@/components"

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
      strictCdn: options.strictCdn
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
    strictCdn: options.strictCdn
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
      config = buildInitConfig({ yes: true, registry: registryName, ...cdnOptions })
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
      }
    ])

    const aliasComponents = responses.aliasComponents?.trim() || "@/components"
    const globalCss = responses.globalCss || "src/index.css"
    config = buildInitConfig({
      yes: false,
      registry: registryName,
      globalCss,
          aliasComponents,
          ...cdnOptions
    })
  }
  
  const spinner = ora(CLI_MESSAGES.info.initializing(registryName)).start()
  
  try {
    // Save configuration at project root
    await saveConfig(config)
    
    // Create src-based directory structure
    await ensureDir(config.libDir)
    await ensureDir(config.componentsDir)
    await ensureDir(path.join(config.componentsDir, "ui")) // src/components/ui
    await ensureDir(SCHEMA_CONFIG.defaultDirectories.blocks)
    await ensureDir(SCHEMA_CONFIG.defaultDirectories.layouts)
    await ensureDir(SCHEMA_CONFIG.defaultDirectories.variants)
    
    spinner.text = "Installing core utilities and variants..."
    
    // Install utils and all variants from registry
    await installCoreFiles(registryName as RegistryType, config, spinner, cdnOptions)

    // Install packages required by src/lib/utils.ts (cn helper).
    spinner.text = "Installing core dependencies..."
    await installDependencies(["clsx", "tailwind-merge"], {
      useSpinner: false
    })
    
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

async function installCoreFiles(registryType: RegistryType, config: Config, spinner: Ora, cdnResolution: CdnResolutionOptions = {}): Promise<void> {
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
  
  // Install utils (lib items)
  for (const item of libItems) {
    spinner.text = `Installing ${item.name}...`
    await installComponentFromRegistry(item.name, "registry:lib", cdnUrls, config)
  }
  
  // Install all variants
  for (const item of variantItems) {
    spinner.text = `Installing variant: ${item.name}...`
    await installComponentFromRegistry(item.name, "registry:variants", cdnUrls, config)
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
  
  spinner.text = `✅ Installed ${libItems.length} utilities and ${variantItems.length} variants`
}

async function installComponentFromRegistry(
  name: string, 
  type: string, 
  cdnUrls: string[], 
  config: Config
): Promise<void> {
  const folder = type === "registry:lib" ? "lib" : type === "registry:variants" ? "components/variants" : "components/ui"
  
  for (const baseUrl of cdnUrls) {
    const url = `${baseUrl}/${folder}/${name}.json`
    const component = await fetchJsonFromRegistry<Component>(url)
    if (!component) {
      continue
    }

    for (const file of component.files) {
      const fileName = path.basename(file.path)
      let targetDir: string
      
      if (type === "registry:lib") {
        targetDir = config.libDir
      } else if (type === "registry:variants") {
        targetDir = SCHEMA_CONFIG.defaultDirectories.variants
      } else {
        targetDir = path.join(config.componentsDir, "ui")
      }
      
      const targetPath = path.join(process.cwd(), targetDir, fileName)
      await fs.ensureDir(path.dirname(targetPath))
      await fs.writeFile(targetPath, file.content || "", "utf-8")
    }
    return
  }
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
