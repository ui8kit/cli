import path from "node:path"
import { ensureDir, pathExists, readFile, writeFile } from "../utils/fs.js"
import { walkFiles, listFilesFlat } from "../utils/walk.js"
import { SCHEMA_CONFIG, isExternalDependency, TYPE_TO_FOLDER } from "../utils/schema-config.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { handleError } from "../utils/errors.js"
import { Spinner } from "../utils/logger.js"

interface ScanOptions {
  cwd: string
  registry: string
  outputFile: string
  sourceDir: string
}

interface ComponentFile {
  path: string
  content?: string
  target?: string
}

interface RegistryItem {
  name: string
  type: string
  description?: string
  dependencies: string[]
  devDependencies: string[]
  registryDependencies: string[]
  files: ComponentFile[]
}

const DEV_PATTERNS = [
  "@types/",
  "eslint",
  "prettier",
  "typescript",
  "jest",
  "vitest",
  "testing-library",
  "@testing-library/",
  "storybook",
  "@storybook/",
  "webpack",
  "vite",
  "rollup",
  "babel",
  "@babel/",
  "postcss",
  "tailwindcss",
  "autoprefixer",
] as const

const PACKAGE_CORE_PREFIX = "@ui8kit/core"
const PACKAGE_STYLE_BARS = ["components", "layouts", "blocks", "variants", "ui"] as const
const PACKAGE_STYLE_ALIASES = [
  "@/components",
  "@/components/ui",
  "@/ui",
  "@/layouts",
  "@/blocks",
  "@/variants",
]

const REGISTRY_ALIAS_ROOTS = Object.keys(SCHEMA_CONFIG.defaultAliases)

/** Match import/export module specifiers. */
const MODULE_SPEC_RE =
  /(?:import|export)(?:[\s\w*{}$]*?)\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g

const NAMED_IMPORT_RE = /import\s+(?:[\w*]+\s*,\s*)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g
const DEFAULT_IMPORT_RE = /import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s+from\s+['"]([^'"]+)['"]/g

function toPosix(value: string): string {
  return value.replace(/\\/g, "/")
}

function toLowerOrEmpty(value: string): string {
  return value.trim().toLowerCase()
}

function stripImportExtension(moduleName: string): string {
  return moduleName.replace(/\.[tj]sx?$/i, "")
}

function getAliasMatch(moduleName: string): { alias: string; remainder: string } | null {
  const normalized = toPosix(moduleName)
  if (!normalized.startsWith("@/")) return null

  const directMatch = REGISTRY_ALIAS_ROOTS.filter(
    (alias) => normalized === alias || normalized.startsWith(`${alias}/`),
  ).sort((a, b) => b.length - a.length)[0]

  if (!directMatch) return null

  return {
    alias: directMatch,
    remainder: normalized.slice(directMatch.length).replace(/^\/+/, ""),
  }
}

function shouldRewriteAsRegistryDependency(aliasImport: string): boolean {
  const match = getAliasMatch(aliasImport)
  if (!match || !match.remainder) return false
  if (PACKAGE_STYLE_ALIASES.includes(match.alias)) return true
  const firstSegment = match.remainder.split("/")[0]
  return (PACKAGE_STYLE_BARS as readonly string[]).includes(firstSegment)
}

function isUi8kitCoreImport(moduleName: string): boolean {
  return moduleName === PACKAGE_CORE_PREFIX || moduleName.startsWith(`${PACKAGE_CORE_PREFIX}/`)
}

function mapAliasImportToComponentName(moduleName: string): string | null {
  const aliasMatch = getAliasMatch(moduleName)
  if (!aliasMatch?.remainder) return null
  if (!shouldRewriteAsRegistryDependency(moduleName)) return null
  const componentName = stripImportExtension(aliasMatch.remainder).split("/").at(-1)
  return componentName ? toLowerOrEmpty(componentName) : null
}

function extractRegistryDepsFromContent(content: string): string[] {
  const names = new Set<string>()

  for (const match of content.matchAll(NAMED_IMPORT_RE)) {
    const moduleName = match[2]
    if (!isUi8kitCoreImport(moduleName)) continue
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name) names.add(toLowerOrEmpty(name))
    }
  }

  for (const match of content.matchAll(DEFAULT_IMPORT_RE)) {
    const moduleName = match[2]
    if (!isUi8kitCoreImport(moduleName)) continue
    names.add(toLowerOrEmpty(match[1]))
  }

  MODULE_SPEC_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MODULE_SPEC_RE.exec(content)) !== null) {
    const moduleName = m[1] || m[2]
    if (!moduleName) continue
    if (isUi8kitCoreImport(moduleName) && moduleName.startsWith(`${PACKAGE_CORE_PREFIX}/`)) {
      const explicit = toLowerOrEmpty(
        stripImportExtension(moduleName.slice(PACKAGE_CORE_PREFIX.length + 1)),
      )
      if (explicit) names.add(explicit)
    }
    if (moduleName.startsWith("@/")) {
      const aliasName = mapAliasImportToComponentName(moduleName)
      if (aliasName) names.add(aliasName)
    }
  }

  return [...names]
}

function extractNpmDepsFromContent(content: string): { deps: string[]; devDeps: string[] } {
  const deps = new Set<string>()
  const devDeps = new Set<string>()
  MODULE_SPEC_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MODULE_SPEC_RE.exec(content)) !== null) {
    const moduleName = m[1] || m[2]
    if (!moduleName || !isExternalDependency(moduleName)) continue
    if (isDevDependency(moduleName)) devDeps.add(moduleName)
    else deps.add(moduleName)
  }
  return { deps: [...deps], devDeps: [...devDeps] }
}

function isDevDependency(moduleName: string): boolean {
  return DEV_PATTERNS.some((pattern) => moduleName.includes(pattern))
}

function hasValidExports(content: string): boolean {
  return /(?:^|\n)\s*export\s/.test(content)
}

function extractDescription(content: string): string {
  const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n\s*\*\//s)
  if (jsdocMatch) return jsdocMatch[1].trim()
  const commentMatch = content.match(/^\/\/\s*(.+)$/m)
  if (commentMatch) return commentMatch[1].trim()
  return ""
}

function getTargetFromType(type: string): string {
  return TYPE_TO_FOLDER[type as keyof typeof TYPE_TO_FOLDER] || "components"
}

function normalizeDir(dir: string): string {
  return dir.replace(/^\.\//, "").replace(/\\/g, "/")
}

export async function scanCommand(
  options: { cwd?: string; registry?: string; output?: string; source?: string } = {},
) {
  const registryName = options.registry || SCHEMA_CONFIG.defaultRegistryType
  const registryPath = `./${registryName}`

  const scanOptions: ScanOptions = {
    cwd: path.resolve(options.cwd || process.cwd()),
    registry: path.resolve(registryPath),
    outputFile: path.resolve(options.output || "./src/registry.json"),
    sourceDir: path.resolve(options.source || "./src"),
  }

  console.log(CLI_MESSAGES.info.scanningComponents(registryName))

  try {
    const spinner = new Spinner(CLI_MESSAGES.info.scanningDirectories).start()

    const componentsDir = path.resolve(
      scanOptions.cwd,
      normalizeDir(SCHEMA_CONFIG.defaultDirectories.components),
    )
    const uiDir = path.join(componentsDir, "ui")
    const blocksDir = path.resolve(
      scanOptions.cwd,
      normalizeDir(SCHEMA_CONFIG.defaultDirectories.blocks),
    )
    const layoutsDir = path.resolve(
      scanOptions.cwd,
      normalizeDir(SCHEMA_CONFIG.defaultDirectories.layouts),
    )
    const libDir = path.resolve(scanOptions.cwd, normalizeDir(SCHEMA_CONFIG.defaultDirectories.lib))
    const variantsDir = path.resolve(
      scanOptions.cwd,
      normalizeDir(SCHEMA_CONFIG.defaultDirectories.variants),
    )

    const uiComponents = await scanDirectory(uiDir, "registry:ui")
    const compositeComponents = await scanDirectoryFlat(componentsDir, "registry:composite", [
      "index.ts",
    ])
    const variantComponents = await scanDirectory(variantsDir, "registry:variants", ["index.ts"])
    const blockComponents = await scanDirectory(blocksDir, "registry:block")
    const layoutComponents = await scanDirectory(layoutsDir, "registry:layout")
    const libComponents = await scanDirectory(libDir, "registry:lib")

    const variantsIndexItem = await scanSingleFile(
      path.join(variantsDir, "index.ts"),
      "registry:variants",
    )
    const componentsIndexItem = await scanSingleFile(
      path.join(componentsDir, "index.ts"),
      "registry:composite",
    )

    const allComponentsRaw = [
      ...uiComponents,
      ...compositeComponents,
      ...variantComponents,
      ...(variantsIndexItem ? [variantsIndexItem] : []),
      ...(componentsIndexItem ? [componentsIndexItem] : []),
      ...blockComponents,
      ...layoutComponents,
      ...libComponents,
    ]

    const seen = new Set<string>()
    const allComponents: RegistryItem[] = []
    const localDependencyRefs = new Map<string, Set<string>>()

    for (const comp of allComponentsRaw) {
      const key = `${comp.type}:${comp.name}`
      if (seen.has(key)) continue
      seen.add(key)
      allComponents.push(comp)
    }

    spinner.text = CLI_MESSAGES.info.analyzingDeps.replace(
      "{count}",
      allComponents.length.toString(),
    )

    for (const component of allComponents) {
      const analysis = await analyzeComponentDependencies(component.files, scanOptions.cwd)
      component.dependencies = analysis.dependencies
      component.devDependencies = analysis.devDependencies
      localDependencyRefs.set(
        `${component.type}:${component.name}`,
        new Set(analysis.registryDependencies.map(toLowerOrEmpty)),
      )
      if (analysis.description && !component.description) {
        component.description = analysis.description
      }
    }

    const availableComponents = new Set(allComponents.map((item) => item.name.toLowerCase()))
    allComponents.forEach((item) => {
      const rawDependencies =
        localDependencyRefs.get(`${item.type}:${item.name}`) ?? new Set<string>()
      const resolvedDependencies = new Set<string>()
      const unresolvedDependencies: string[] = []

      for (const candidate of rawDependencies) {
        const normalized = toLowerOrEmpty(candidate)
        if (!normalized || normalized === item.name.toLowerCase()) continue
        if (!availableComponents.has(normalized)) {
          unresolvedDependencies.push(normalized)
          continue
        }
        resolvedDependencies.add(normalized)
      }

      if (unresolvedDependencies.length > 0) {
        console.warn(
          `Missing local component references in ${item.name} (${item.type}): ${unresolvedDependencies.join(", ")}`,
        )
      }

      item.registryDependencies = Array.from(resolvedDependencies).sort()
    })

    const registry = {
      $schema: "https://ui.buildy.tw/schema/registry.json",
      items: allComponents,
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      registry: registryName,
    }

    await ensureDir(path.dirname(scanOptions.outputFile))
    await writeFile(scanOptions.outputFile, JSON.stringify(registry, null, 2))

    spinner.succeed(CLI_MESSAGES.status.scannedComponents(allComponents.length))
    console.log(CLI_MESSAGES.success.registryGenerated(registryName))
    console.log(`Output: ${scanOptions.outputFile}`)

    const summary = allComponents.reduce(
      (acc, comp) => {
        acc[comp.type] = (acc[comp.type] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    console.log("\nComponent Summary:")
    Object.entries(summary).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`)
    })

    const allDeps = new Set<string>()
    const allDevDeps = new Set<string>()
    allComponents.forEach((comp) => {
      comp.dependencies.forEach((dep) => allDeps.add(dep))
      comp.devDependencies.forEach((dep) => allDevDeps.add(dep))
    })

    console.log("\nDependencies Summary:")
    console.log(`   Dependencies: ${allDeps.size} unique (${Array.from(allDeps).join(", ") || "none"})`)
    console.log(
      `   DevDependencies: ${allDevDeps.size} unique (${Array.from(allDevDeps).join(", ") || "none"})`,
    )
  } catch (error) {
    handleError(error)
  }
}

async function scanDirectory(
  dirPath: string,
  type: string,
  ignorePatterns: string[] = [],
): Promise<RegistryItem[]> {
  if (!(await pathExists(dirPath))) return []

  const ignoreNames = ignorePatterns.map((p) => path.basename(p))
  const files = await walkFiles(dirPath, { recursive: true, ignoreNames })
  const components: RegistryItem[] = []

  for (const filePath of files) {
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/")
    const fileName = path.basename(filePath, path.extname(filePath))
    if (fileName === "index" || fileName.startsWith("_")) continue

    try {
      const content = await readFile(filePath, "utf-8")
      if (!hasValidExports(content)) continue
      components.push({
        name: fileName,
        type,
        description: extractDescription(content),
        dependencies: [],
        devDependencies: [],
        registryDependencies: [],
        files: [{ path: relativePath, target: getTargetFromType(type) }],
      })
    } catch (error) {
      console.warn(`Warning: Could not process ${filePath}:`, (error as Error).message)
    }
  }

  return components
}

async function scanDirectoryFlat(
  dirPath: string,
  type: string,
  ignoreFiles: string[] = [],
): Promise<RegistryItem[]> {
  if (!(await pathExists(dirPath))) return []

  const files = await listFilesFlat(dirPath)
  const components: RegistryItem[] = []

  for (const filePath of files) {
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/")
    const base = path.basename(filePath)
    const fileName = path.basename(filePath, path.extname(filePath))
    if (ignoreFiles.includes(base) || fileName.startsWith("_")) continue

    try {
      const content = await readFile(filePath, "utf-8")
      if (!hasValidExports(content)) continue
      components.push({
        name: fileName,
        type,
        description: extractDescription(content),
        dependencies: [],
        devDependencies: [],
        registryDependencies: [],
        files: [{ path: relativePath, target: getTargetFromType(type) }],
      })
    } catch (error) {
      console.warn(`Warning: Could not process ${filePath}:`, (error as Error).message)
    }
  }

  return components
}

async function scanSingleFile(filePath: string, type: string): Promise<RegistryItem | null> {
  if (!(await pathExists(filePath))) return null

  try {
    const content = await readFile(filePath, "utf-8")
    if (!hasValidExports(content)) return null
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/")
    const fileName = path.basename(filePath, path.extname(filePath))
    return {
      name: fileName,
      type,
      description: extractDescription(content),
      dependencies: [],
      devDependencies: [],
      registryDependencies: [],
      files: [{ path: relativePath, target: getTargetFromType(type) }],
    }
  } catch (error) {
    console.warn(`Warning: Could not process ${filePath}:`, (error as Error).message)
    return null
  }
}

async function analyzeComponentDependencies(
  files: ComponentFile[],
  cwd: string,
): Promise<{
  dependencies: string[]
  devDependencies: string[]
  description?: string
  registryDependencies: string[]
}> {
  const allDependencies = new Set<string>()
  const allDevDependencies = new Set<string>()
  const allRegistryDependencies = new Set<string>()
  let description: string | undefined

  for (const file of files) {
    try {
      const filePath = path.resolve(cwd, file.path)
      const content = await readFile(filePath, "utf-8")
      const { deps, devDeps } = extractNpmDepsFromContent(content)
      deps.forEach((d) => allDependencies.add(d))
      devDeps.forEach((d) => allDevDependencies.add(d))
      extractRegistryDepsFromContent(content).forEach((d) => allRegistryDependencies.add(d))
      if (!description) {
        const d = extractDescription(content)
        if (d) description = d
      }
    } catch (error) {
      console.warn(CLI_MESSAGES.errors.failedToAnalyzeDeps(file.path), (error as Error).message)
    }
  }

  return {
    dependencies: Array.from(allDependencies),
    devDependencies: Array.from(allDevDependencies),
    description,
    registryDependencies: Array.from(allRegistryDependencies),
  }
}

// TYPE_TO_FOLDER mapping used via getTargetFromType
