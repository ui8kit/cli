import path from "path"
import prompts from "prompts"
import { Component } from "../registry/schema.js"
import type { Config } from "../registry/schema.js"
import {
  getCdnUrls,
  SCHEMA_CONFIG,
  type CdnResolutionOptions,
  type Framework,
  type ImportStyle,
  type RegistryType,
  type Runtime,
  FRAMEWORKS,
  RUNTIMES,
} from "../utils/schema-config.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { handleError } from "../utils/errors.js"
import { logger, Spinner } from "../utils/logger.js"
import { installDependencies } from "../utils/package-manager.js"
import {
  defaultAliasesForDir,
  listInstallRoots,
  normalizeDir,
  resolveFileInstallPath,
} from "../utils/paths.js"
import { detectFrameworkHint, findConfig, saveConfig, ensureDir, hasPackageJson } from "../utils/project.js"
import { ensureDir as fsEnsureDir, writeFile, writeJson } from "../utils/fs.js"

export interface InitOptions {
  yes?: boolean
  registry?: string
  registryUrl?: string
  registryVersion?: string
  strictCdn?: boolean
  importStyle?: ImportStyle
  framework?: string
  runtime?: string
  dir?: string
  skipCore?: boolean
}

export interface InitConfigOptions {
  yes: boolean
  registry: string
  globalCss?: string
  aliasComponents?: string
  importStyle?: ImportStyle
  framework?: Framework
  runtime?: Runtime
  dir?: string
  registryUrl?: string
  registryVersion?: string
  strictCdn?: boolean
  cdnBaseUrls?: string[]
}

async function fetchJsonFromRegistry<T>(url: string): Promise<T | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

function resolveImportStyle(raw?: ImportStyle): ImportStyle {
  return raw === "package" ? "package" : "alias"
}

function asFramework(value?: string): Framework {
  if (value && (FRAMEWORKS as readonly string[]).includes(value)) {
    return value as Framework
  }
  return "none"
}

/** Explicit --framework / --runtime values must be known (no silent fallback). */
export function assertKnownInitOptions(options: { framework?: string; runtime?: string }): void {
  if (options.framework && !(FRAMEWORKS as readonly string[]).includes(options.framework)) {
    throw new Error(`Unknown --framework "${options.framework}". Valid: ${FRAMEWORKS.join(", ")}`)
  }
  if (options.runtime && !(RUNTIMES as readonly string[]).includes(options.runtime)) {
    throw new Error(`Unknown --runtime "${options.runtime}". Valid: ${RUNTIMES.join(", ")}`)
  }
}

function asRuntime(value?: string, framework?: Framework): Runtime | undefined {
  if (value && (RUNTIMES as readonly string[]).includes(value)) {
    return value as Runtime
  }
  if (framework && (RUNTIMES as readonly string[]).includes(framework)) {
    return framework as Runtime
  }
  return undefined
}

export function buildInitConfig(options: InitConfigOptions): Config {
  const dir = normalizeDir(options.dir || SCHEMA_CONFIG.defaultDir)
  const aliases = defaultAliasesForDir(dir)
  const framework = asFramework(options.framework)
  const runtime = asRuntime(options.runtime, framework)
  const importStyle = resolveImportStyle(options.importStyle)
  const globalCss = options.globalCss || (dir === "src" ? "src/index.css" : `${dir}/app.css`)

  if (!options.yes && options.aliasComponents?.trim()) {
    aliases["@/components"] = options.aliasComponents.trim()
  }

  return {
    $schema: `${SCHEMA_CONFIG.baseUrl}.json`,
    contractVersion: SCHEMA_CONFIG.cliContractVersion,
    framework,
    runtime,
    typescript: true,
    globalCss,
    dir,
    aliases,
    registry: SCHEMA_CONFIG.defaultRegistry,
    registryUrl: options.registryUrl,
    registryVersion: options.registryVersion,
    cdnBaseUrls: options.cdnBaseUrls,
    strictCdn: options.strictCdn,
    importStyle,
  }
}

export async function initCommand(options: InitOptions) {
  const registryName = options.registry || SCHEMA_CONFIG.defaultRegistryType
  const cdnOptions: CdnResolutionOptions = {
    registryUrl: options.registryUrl,
    registryVersion: options.registryVersion,
    strictCdn: options.strictCdn,
  }

  try {
    assertKnownInitOptions(options)
  } catch (error) {
    handleError(error)
    return
  }

  logger.info(CLI_MESSAGES.info.initializing(registryName))

  if (!(await hasPackageJson())) {
    logger.warn("No package.json found — creating minimal package.json for CLI tooling.")
    await writeJson(
      path.join(process.cwd(), "package.json"),
      { name: path.basename(process.cwd()) || "app", private: true },
      { spaces: 2 },
    )
  }

  const existingConfig = await findConfig(registryName)
  if (existingConfig && !options.yes) {
    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: CLI_MESSAGES.prompts.overwrite(registryName),
      initial: false,
    })
    if (!overwrite) {
      logger.warn(CLI_MESSAGES.info.installationCancelled)
      return
    }
  }

  const detected = await detectFrameworkHint()
  let config: Config

  if (options.yes) {
    config = buildInitConfig({
      yes: true,
      registry: registryName,
      framework: asFramework(options.framework || detected),
      runtime: asRuntime(options.runtime, asFramework(options.framework || detected)),
      dir: options.dir,
      importStyle: options.importStyle,
      ...cdnOptions,
    })
  } else {
    const responses = await prompts([
      {
        type: "select",
        name: "framework",
        message: "Framework / stack",
        choices: FRAMEWORKS.map((f) => ({ title: f, value: f })),
        initial: Math.max(0, FRAMEWORKS.indexOf(asFramework(options.framework || detected))),
      },
      {
        type: "text",
        name: "dir",
        message: "Install root (dir)",
        initial: options.dir || "src",
      },
      {
        type: "text",
        name: "globalCss",
        message: CLI_MESSAGES.prompts.globalCss,
        initial: "src/index.css",
      },
      {
        type: "text",
        name: "registryUrl",
        message: "Registry CDN base URL (empty = defaults)",
        initial: options.registryUrl || "",
      },
      {
        type: "select",
        name: "importStyle",
        message: "Import style for TS/TSX rewrites",
        choices: [
          { title: "Alias imports (recommended)", value: "alias" as ImportStyle },
          { title: "Package imports (@ui8kit/core)", value: "package" as ImportStyle },
        ],
        initial: 0,
      },
    ])

    const framework = asFramework(responses.framework)
    config = buildInitConfig({
      yes: false,
      registry: registryName,
      framework,
      runtime: asRuntime(undefined, framework),
      dir: responses.dir || "src",
      globalCss: responses.globalCss,
      importStyle: resolveImportStyle(responses.importStyle),
      registryUrl: responses.registryUrl || options.registryUrl,
      registryVersion: options.registryVersion,
      strictCdn: options.strictCdn,
    })
  }

  const spinner = new Spinner(CLI_MESSAGES.info.initializing(registryName)).start()

  try {
    await saveConfig(config)

    for (const root of listInstallRoots(config)) {
      await ensureDir(root)
    }

    if (!options.skipCore) {
      spinner.text = "Installing core utils from registry (best-effort)..."
      await installCoreFiles(registryName as RegistryType, config, spinner, {
        ...cdnOptions,
        cdnBaseUrls: config.cdnBaseUrls,
      })
    }

    spinner.succeed(CLI_MESSAGES.success.initialized(registryName))
    logger.success(`\n✅ ${CLI_MESSAGES.success.setupComplete(registryName)}`)
    console.log(`\nContract ${SCHEMA_CONFIG.cliContractVersion} · dir=${config.dir} · framework=${config.framework}`)
    console.log("\nDirectories:")
    for (const root of listInstallRoots(config)) {
      console.log(`  ${root}/`)
    }
    console.log("\nNext steps:")
    CLI_MESSAGES.examples.init.forEach((example) => console.log(`  ${example}`))
  } catch (error) {
    spinner.fail(CLI_MESSAGES.errors.buildFailed)
    handleError(error)
  }
}

interface RegistryIndex {
  components: Array<{ name: string; type: string }>
}

interface CoreComponentDescriptor {
  name: string
  type: string
  component: Component
}

async function installCoreFiles(
  registryType: RegistryType,
  config: Config,
  spinner: Spinner,
  cdnResolution: CdnResolutionOptions = {},
): Promise<void> {
  const cdnUrls = getCdnUrls(registryType, cdnResolution)

  let registryIndex: RegistryIndex | null = null
  for (const baseUrl of cdnUrls) {
    const indexData = await fetchJsonFromRegistry<RegistryIndex>(`${baseUrl}/index.json`)
    if (indexData?.components) {
      registryIndex = indexData
      break
    }
  }

  if (!registryIndex) {
    spinner.text = "Registry unreachable — skipping core install"
    logger.warn("Could not reach registry to install core lib/utils/variants")
    return
  }

  const coreRefs = registryIndex.components.filter(
    (c) => c.type === "registry:lib" || c.type === "registry:utils" || c.type === "registry:variants",
  )

  if (coreRefs.length === 0) {
    spinner.text = "No core registry items found — skipping"
    return
  }

  const loaded: CoreComponentDescriptor[] = []
  const deps = new Set<string>()

  for (const item of coreRefs) {
    spinner.text = `Fetching ${item.name}...`
    const component = await fetchCoreComponent(item.name, item.type, cdnUrls)
    if (!component) continue
    loaded.push({ name: item.name, type: item.type, component })
    for (const d of component.dependencies ?? []) deps.add(d)
  }

  for (const descriptor of loaded) {
    spinner.text = `Installing ${descriptor.name}...`
    await writeComponentFiles(descriptor.component, config)
  }

  if (deps.size > 0) {
    spinner.text = "Installing core dependencies..."
    try {
      await installDependencies(Array.from(deps), { useSpinner: false })
    } catch {
      logger.warn("Could not install some core npm dependencies — install manually if needed")
    }
  }

  spinner.text = `Installed ${loaded.length} core items`
}

async function fetchCoreComponent(
  name: string,
  type: string,
  cdnUrls: string[],
): Promise<Component | null> {
  const folders =
    type === "registry:lib"
      ? ["lib", "components/lib"]
      : type === "registry:utils"
        ? ["utils", "lib"]
        : type === "registry:variants"
          ? ["variants", "components/variants"]
          : ["components/ui", "ui"]

  for (const baseUrl of cdnUrls) {
    for (const folder of folders) {
      const component = await fetchJsonFromRegistry<Component>(`${baseUrl}/${folder}/${name}.json`)
      if (component?.files?.length) return component
    }
  }
  return null
}

async function writeComponentFiles(component: Component, config: Config): Promise<void> {
  for (const file of component.files) {
    const targetPath = path.join(
      process.cwd(),
      resolveFileInstallPath(file, component.type, config),
    )
    await fsEnsureDir(path.dirname(targetPath))
    await writeFile(targetPath, file.content || "", "utf-8")
  }
}
