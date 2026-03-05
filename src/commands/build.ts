import fs from "fs-extra"
import path from "path"
import chalk from "chalk"
import ora from "ora"
import { registrySchema, registryItemSchema } from "../registry/build-schema.js"
import { generateConfigSchema, generateRegistrySchema, generateRegistryItemSchema } from "../utils/schema-generator.js"
import { TYPE_TO_FOLDER, SCHEMA_CONFIG, isExternalDependency } from "../utils/schema-config.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { handleError } from "../utils/errors.js"

interface BuildOptions {
  cwd: string
  registryFile: string
  outputDir: string
}

export async function buildCommand(
  registryPath = "./src/registry.json",
  options: { output?: string; cwd?: string } = {}
) {
  const buildOptions: BuildOptions = {
    cwd: path.resolve(options.cwd || process.cwd()),
    registryFile: path.resolve(registryPath),
    outputDir: path.resolve(options.output || "./packages/registry/r"),
  }

  console.log(chalk.blue(CLI_MESSAGES.info.building))
  
  try {
    // Read registry.json
    const registryContent = await fs.readFile(buildOptions.registryFile, "utf-8")
    const registryData = JSON.parse(registryContent)
    
    // Validate schema
    const registry = registrySchema.parse(registryData)
    await ensureVariantsIndexItem(registry, buildOptions.cwd)
    
    // Create output directory
    await fs.ensureDir(buildOptions.outputDir)
    
    // Generate schema files
    await generateSchemaFiles(buildOptions.outputDir)
    
    const spinner = ora(CLI_MESSAGES.info.processingComponents).start()
    
    for (const item of registry.items) {
      spinner.text = `Building ${item.name}...`
      
      // Add schema
      item.$schema = "https://ui.buildy.tw/schema/registry-item.json"
      
      // Read file contents from utility structure
      for (const file of item.files) {
        const filePath = path.resolve(buildOptions.cwd, file.path)
        
        if (await fs.pathExists(filePath)) {
          file.content = await fs.readFile(filePath, "utf-8")
        } else {
          throw new Error(CLI_MESSAGES.errors.fileNotFound(file.path))
        }
      }
      
      // Validate final item
      const validatedItem = registryItemSchema.parse(item)
      
      // Determine output directory by type
      const typeDir = getOutputDir(validatedItem.type)
      const outputPath = path.join(buildOptions.outputDir, typeDir)
      await fs.ensureDir(outputPath)
      
      // Write file
      const outputFile = path.join(outputPath, `${validatedItem.name}.json`)
      await fs.writeFile(outputFile, JSON.stringify(validatedItem, null, 2))
    }
    
    spinner.succeed(CLI_MESSAGES.status.builtComponents(registry.items.length))
    
    // Create index file at /r/index.json
    await createIndexFile(registry, buildOptions.outputDir)
    
    console.log(chalk.green(`✅ ${CLI_MESSAGES.success.registryBuilt}`))
    console.log(`Output: ${buildOptions.outputDir}`)
    console.log(chalk.green(`✅ ${CLI_MESSAGES.success.schemasGenerated}`))
    
  } catch (error) {
    handleError(error)
  }
}

// Build output directories (for CDN/registry structure)
// Note: This differs from TYPE_TO_FOLDER which is for user installation paths
const BUILD_OUTPUT_FOLDERS = {
  "registry:ui": "components/ui",
  "registry:composite": "components",
  "registry:block": "blocks", 
  "registry:component": "components",
  "registry:lib": "lib",
  "registry:layout": "layouts",
  "registry:variants": "components/variants"
} as const

function getOutputDir(type: string): string {
  const folder = BUILD_OUTPUT_FOLDERS[type as keyof typeof BUILD_OUTPUT_FOLDERS]
  return folder || "misc"
}

async function createIndexFile(registry: any, outputDir: string) {
  const index = {
    $schema: "https://ui.buildy.tw/schema/registry.json",
    components: registry.items.map((item: any) => ({
      name: item.name,
      type: item.type,
      title: item.title,
      description: item.description,
    })),
    categories: SCHEMA_CONFIG.componentCategories,
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    registry: registry?.registry || SCHEMA_CONFIG.defaultRegistryType,
  }
  
  await fs.writeFile(
    path.join(outputDir, "index.json"),
    JSON.stringify(index, null, 2)
  )
}

async function generateSchemaFiles(outputDir: string) {
  const registryBaseDir = path.dirname(outputDir)
  
  // Create schema directory
  const schemaDir = path.join(registryBaseDir, "schema")
  await fs.ensureDir(schemaDir)
  
  // Generate schemas dynamically from Zod schemas
  const configSchemaJson = generateConfigSchema()
  const registrySchemaJson = generateRegistrySchema()
  const registryItemSchemaJson = generateRegistryItemSchema()
  
  // Write schema files
  await fs.writeFile(
    path.join(registryBaseDir, "schema.json"),
    JSON.stringify(configSchemaJson, null, 2)
  )
  
  await fs.writeFile(
    path.join(schemaDir, "registry.json"),
    JSON.stringify(registrySchemaJson, null, 2)
  )
  
  await fs.writeFile(
    path.join(schemaDir, "registry-item.json"),
    JSON.stringify(registryItemSchemaJson, null, 2)
  )
}

async function ensureVariantsIndexItem(registry: any, cwd: string): Promise<void> {
  const indexSourcePath = path.join(cwd, "src/variants/index.ts")

  if (!(await fs.pathExists(indexSourcePath))) {
    return
  }

  const sourceContent = await fs.readFile(indexSourcePath, "utf-8")
  const dependencies = extractFileDependencies(sourceContent)
  const exportedModules = extractExportedModules(sourceContent)

  const indexItem = {
    name: "index",
    type: "registry:variants",
    description: exportedModules.length > 0
      ? `Variant exports: ${exportedModules.join(", ")}`
      : "Variants export index",
    dependencies,
    devDependencies: [],
    files: [
      {
        path: path.relative(cwd, indexSourcePath).replace(/\\/g, "/")
      }
    ]
  }

  const items = Array.isArray(registry.items) ? registry.items : []
  const existingIndexIdx = items.findIndex((item: any) =>
    item && item.name === "index"
  )

  if (existingIndexIdx >= 0) {
    items[existingIndexIdx] = {
      ...items[existingIndexIdx],
      ...indexItem
    }
  } else {
    items.push(indexItem)
  }
}

function extractExportedModules(content: string): string[] {
  const exports = new Set<string>()
  const starExportRegex = /export\s+\*\s+from\s+['"]\.\/([^'"]+)['"]/g
  const namedExportRegex = /export\s+\{[^}]+\}\s+from\s+['"]\.\/([^'"]+)['"]/g

  let match: RegExpExecArray | null
  while ((match = starExportRegex.exec(content)) !== null) {
    exports.add(match[1])
  }
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.add(match[1])
  }

  return [...exports]
}

function extractFileDependencies(content: string): string[] {
  const dependencies = new Set<string>()
  const importRegex = /import\s+[^;\n]+?from\s+['"]([^'"]+)['"]/g

  let match: RegExpExecArray | null
  while ((match = importRegex.exec(content)) !== null) {
    const moduleName = match[1]
    if (isExternalDependency(moduleName)) {
      dependencies.add(moduleName)
    }
  }

  return [...dependencies]
}
