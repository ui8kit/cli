import path from "node:path"
import { ensureDir, pathExists, readFile, writeFile } from "../utils/fs.js"
import { registrySchema, registryItemSchema } from "../registry/build-schema.js"
import { resetCache } from "../registry/api.js"
import { SCHEMA_CONFIG, getSchemaRef, isExternalDependency } from "../utils/schema-config.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { handleError } from "../utils/errors.js"
import { clearCache } from "../utils/cache.js"
import { Spinner } from "../utils/logger.js"

interface BuildOptions {
  cwd: string
  registryFile: string
  outputDir: string
}

const BUILD_OUTPUT_FOLDERS = {
  "registry:ui": "components/ui",
  "registry:composite": "components",
  "registry:block": "blocks",
  "registry:component": "components",
  "registry:lib": "lib",
  "registry:utils": "utils",
  "registry:layout": "layouts",
  "registry:variants": "components/variants",
  "registry:widget": "widgets",
  "registry:rules": "rules",
} as const

export async function buildCommand(
  registryPath = "./src/registry.json",
  options: { output?: string; cwd?: string } = {},
) {
  const buildOptions: BuildOptions = {
    cwd: path.resolve(options.cwd || process.cwd()),
    registryFile: path.resolve(registryPath),
    outputDir: path.resolve(options.output || "./packages/registry/r"),
  }

  console.log(CLI_MESSAGES.info.building)

  try {
    await clearCache()
    resetCache()

    const registryContent = await readFile(buildOptions.registryFile, "utf-8")
    const registryData = JSON.parse(registryContent)
    const registry = registrySchema.parse(registryData)
    await ensureVariantsIndexItem(registry, buildOptions.cwd)

    await ensureDir(buildOptions.outputDir)

    const spinner = new Spinner(CLI_MESSAGES.info.processingComponents).start()

    for (const item of registry.items) {
      spinner.text = `Building ${item.name}...`
      item.$schema = getSchemaRef("registry-item")

      for (const file of item.files) {
        const filePath = path.resolve(buildOptions.cwd, file.path)
        if (await pathExists(filePath)) {
          file.content = await readFile(filePath, "utf-8")
        } else {
          throw new Error(CLI_MESSAGES.errors.fileNotFound(file.path))
        }
      }

      const validatedItem = registryItemSchema.parse(item)
      const typeDir = getOutputDir(validatedItem.type)
      const outputPath = path.join(buildOptions.outputDir, typeDir)
      await ensureDir(outputPath)
      await writeFile(
        path.join(outputPath, `${validatedItem.name}.json`),
        JSON.stringify(validatedItem, null, 2),
      )
    }

    spinner.succeed(CLI_MESSAGES.status.builtComponents(registry.items.length))
    await createIndexFile(registry, buildOptions.outputDir)

    console.log(CLI_MESSAGES.success.registryBuilt)
    console.log(`Output: ${buildOptions.outputDir}`)
  } catch (error) {
    handleError(error)
  }
}

function getOutputDir(type: string): string {
  const folder = BUILD_OUTPUT_FOLDERS[type as keyof typeof BUILD_OUTPUT_FOLDERS]
  return folder || "misc"
}

async function createIndexFile(
  registry: { items: any[]; registry?: string; version?: string; meta?: Record<string, unknown> },
  outputDir: string,
) {
  const index = {
    $schema: getSchemaRef("registry"),
    components: registry.items.map((item) => ({
      name: item.name,
      type: item.type,
      title: item.title,
      description: item.description,
      dependencies: item.dependencies ?? [],
      registryDependencies: item.registryDependencies ?? [],
    })),
    categories: SCHEMA_CONFIG.componentCategories,
    version: registry.version || "1.0.0",
    lastUpdated: new Date().toISOString(),
    registry: registry?.registry || SCHEMA_CONFIG.defaultRegistryType,
    // Free-form registry metadata, e.g. brand registries: meta.primitives { registry, version }.
    ...(registry.meta ? { meta: registry.meta } : {}),
  }

  await writeFile(path.join(outputDir, "index.json"), JSON.stringify(index, null, 2))
}

async function ensureVariantsIndexItem(registry: { items: any[] }, cwd: string): Promise<void> {
  const indexSourcePath = path.join(cwd, "src/variants/index.ts")
  if (!(await pathExists(indexSourcePath))) return

  const sourceContent = await readFile(indexSourcePath, "utf-8")
  const dependencies = extractFileDependencies(sourceContent)
  const exportedModules = extractExportedModules(sourceContent)

  const indexItem = {
    type: "registry:variants",
    name: "index",
    description:
      exportedModules.length > 0
        ? `Variant exports: ${exportedModules.join(", ")}`
        : "Variants export index",
    dependencies,
    devDependencies: [],
    files: [
      {
        path: path.relative(cwd, indexSourcePath).replace(/\\/g, "/"),
      },
    ],
  }

  const items = Array.isArray(registry.items) ? registry.items : []
  const existingIndexIdx = items.findIndex(
    (item) => item && item.type === indexItem.type && item.name === indexItem.name,
  )

  if (existingIndexIdx >= 0) {
    items[existingIndexIdx] = { ...items[existingIndexIdx], ...indexItem }
  } else {
    items.push(indexItem)
  }
}

function extractExportedModules(content: string): string[] {
  const exports = new Set<string>()
  const starExportRegex = /export\s+\*\s+from\s+['"]\.\/([^'"]+)['"]/g
  const namedExportRegex = /export\s+\{[^}]+\}\s+from\s+['"]\.\/([^'"]+)['"]/g

  let match: RegExpExecArray | null
  while ((match = starExportRegex.exec(content)) !== null) exports.add(match[1])
  while ((match = namedExportRegex.exec(content)) !== null) exports.add(match[1])

  return [...exports]
}

function extractFileDependencies(content: string): string[] {
  const dependencies = new Set<string>()
  const re =
    /(?:import|export)(?:[\s\w*{}$]*?)\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    const moduleName = match[1] || match[2]
    if (moduleName && isExternalDependency(moduleName)) {
      dependencies.add(moduleName)
    }
  }
  return [...dependencies]
}
