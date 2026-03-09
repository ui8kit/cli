import fs from "fs-extra"
import path from "path"
import chalk from "chalk"
import ora from "ora"
import { glob } from "glob"
import * as ts from "typescript"
import { SCHEMA_CONFIG, isExternalDependency, TYPE_TO_FOLDER } from "../utils/schema-config.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { handleError } from "../utils/errors.js"

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

interface ASTAnalysis {
  dependencies: string[]
  devDependencies: string[]
  description?: string
  registryDependencies: string[]
  hasExports: boolean
}

// Dev dependency patterns
const DEV_PATTERNS = [
  '@types/',
  'eslint',
  'prettier',
  'typescript',
  'jest',
  'vitest',
  'testing-library',
  '@testing-library/',
  'storybook',
  '@storybook/',
  'webpack',
  'vite',
  'rollup',
  'babel',
  '@babel/',
  'postcss',
  'tailwindcss',
  'autoprefixer'
] as const

const PACKAGE_CORE_PREFIX = "@ui8kit/core"
const PACKAGE_STYLE_BARS = [
  "components",
  "layouts",
  "blocks",
  "variants",
  "ui"
] as const
const PACKAGE_STYLE_ALIASES = ["@/components", "@/components/ui", "@/ui", "@/layouts", "@/blocks", "@/variants"]

const REGISTRY_ALIAS_ROOTS = Object.keys(SCHEMA_CONFIG.defaultAliases)

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
  if (!normalized.startsWith("@/")) {
    return null
  }

  const directMatch = REGISTRY_ALIAS_ROOTS
    .filter(alias => normalized === alias || normalized.startsWith(`${alias}/`))
    .sort((a, b) => b.length - a.length)[0]

  if (!directMatch) {
    return null
  }

  const remainder = normalized.slice(directMatch.length).replace(/^\/+/, "")
  return {
    alias: directMatch,
    remainder
  }
}

function shouldRewriteAsRegistryDependency(aliasImport: string): boolean {
  const match = getAliasMatch(aliasImport)
  if (!match || !match.remainder) {
    return false
  }
  if (PACKAGE_STYLE_ALIASES.includes(match.alias)) {
    return true
  }

  const firstSegment = match.remainder.split("/")[0]
  return PACKAGE_STYLE_BARS.includes(firstSegment)
}

function isUi8kitCoreImport(moduleName: string): boolean {
  return moduleName === PACKAGE_CORE_PREFIX || moduleName.startsWith(`${PACKAGE_CORE_PREFIX}/`)
}

function extractCoreImportNames(moduleName: string, node: ts.ImportDeclaration): string[] {
  if (!isUi8kitCoreImport(moduleName)) {
    return []
  }

  const names: string[] = []
  const importClause = node.importClause
  if (importClause?.name) {
    names.push(importClause.name.text)
  }

  const namedBindings = importClause?.namedBindings
  if (namedBindings && ts.isNamedImports(namedBindings)) {
    namedBindings.elements.forEach(element => {
      names.push(element.name.text)
    })
  }

  if (moduleName.startsWith(`${PACKAGE_CORE_PREFIX}/`)) {
    const explicitComponent = toLowerOrEmpty(stripImportExtension(moduleName.slice(PACKAGE_CORE_PREFIX.length + 1)))
    if (explicitComponent && !names.includes(explicitComponent)) {
      names.push(explicitComponent)
    }
  }

  return names
}

function mapAliasImportToComponentName(moduleName: string): string | null {
  const aliasMatch = getAliasMatch(moduleName)
  if (!aliasMatch || !aliasMatch.remainder) {
    return null
  }

  if (!shouldRewriteAsRegistryDependency(moduleName)) {
    return null
  }

  const componentName = stripImportExtension(aliasMatch.remainder)
    .split("/")
    .at(-1)

  return componentName ? toLowerOrEmpty(componentName) : null
}

function extractRegistryDependenciesFromImport(node: ts.ImportDeclaration): string[] {
  const moduleSpecifier = node.moduleSpecifier
  if (!ts.isStringLiteral(moduleSpecifier)) {
    return []
  }

  const moduleName = moduleSpecifier.text
  const importedNames: string[] = []

  if (isUi8kitCoreImport(moduleName)) {
    for (const name of extractCoreImportNames(moduleName, node)) {
      importedNames.push(toLowerOrEmpty(name))
    }
    return importedNames
  }

  if (moduleName.startsWith("@/")) {
    const aliasName = mapAliasImportToComponentName(moduleName)
    if (aliasName) {
      importedNames.push(aliasName)
    }
  }

  return importedNames
}

function toGlobAll(dir: string): string {
  return path.join(dir, "**/*").replace(/\\/g, "/")
}

export async function scanCommand(
  options: { cwd?: string; registry?: string; output?: string; source?: string } = {}
) {
  const registryName = options.registry || SCHEMA_CONFIG.defaultRegistryType
  const registryPath = `./${registryName}`
  
  const scanOptions: ScanOptions = {
    cwd: path.resolve(options.cwd || process.cwd()),
    registry: path.resolve(registryPath),
    outputFile: path.resolve(options.output || "./src/registry.json"),
    sourceDir: path.resolve(options.source || "./src"),
  }

  console.log(chalk.blue(`🔍 ${CLI_MESSAGES.info.scanningComponents(registryName)}`))
  
  try {
    const spinner = ora(CLI_MESSAGES.info.scanningDirectories).start()
    
    // Resolve directories based on SCHEMA_CONFIG
    const componentsDir = path.resolve(scanOptions.cwd, normalizeDir(SCHEMA_CONFIG.defaultDirectories.components))
    const uiDir = path.join(componentsDir, "ui")
    const blocksDir = path.resolve(scanOptions.cwd, normalizeDir(SCHEMA_CONFIG.defaultDirectories.blocks))
    const layoutsDir = path.resolve(scanOptions.cwd, normalizeDir(SCHEMA_CONFIG.defaultDirectories.layouts))
    const libDir = path.resolve(scanOptions.cwd, normalizeDir(SCHEMA_CONFIG.defaultDirectories.lib))
    const variantsDir = path.resolve(scanOptions.cwd, normalizeDir(SCHEMA_CONFIG.defaultDirectories.variants))
    
    // Scan different component types
    const uiComponents = await scanDirectory(uiDir, "registry:ui")
    const compositeComponents = await scanDirectoryFlat(componentsDir, "registry:composite", ["index.ts"])
    const variantComponents = await scanDirectory(variantsDir, "registry:variants", ["index.ts"])
    const blockComponents = await scanDirectory(blocksDir, "registry:block")
    const layoutComponents = await scanDirectory(layoutsDir, "registry:layout")
    const libComponents = await scanDirectory(libDir, "registry:lib")
    
    // Scan index files as special items
    const variantsIndexItem = await scanSingleFile(path.join(variantsDir, "index.ts"), "registry:variants")
    const componentsIndexItem = await scanSingleFile(path.join(componentsDir, "index.ts"), "registry:composite")
    
    // Merge and deduplicate by (type,name)
    const allComponentsRaw = [
      ...uiComponents,
      ...compositeComponents,
      ...variantComponents,
      ...(variantsIndexItem ? [variantsIndexItem] : []),
      ...(componentsIndexItem ? [componentsIndexItem] : []),
      ...blockComponents,
      ...layoutComponents,
      ...libComponents
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
    
    spinner.text = CLI_MESSAGES.info.analyzingDeps.replace("{count}", allComponents.length.toString())
    
    // Analyze each component for dependencies and devDependencies
    for (const component of allComponents) {
    const analysis = await analyzeComponentDependencies(component.files, scanOptions.cwd)
      component.dependencies = analysis.dependencies
      component.devDependencies = analysis.devDependencies
    localDependencyRefs.set(
      `${component.type}:${component.name}`,
      new Set(analysis.registryDependencies.map(toLowerOrEmpty))
    )
      
      // Update description if found during analysis
      if (analysis.description && !component.description) {
        component.description = analysis.description
      }
    }

  const availableComponents = new Set(allComponents.map(item => item.name.toLowerCase()))
  allComponents.forEach(item => {
    const rawDependencies = localDependencyRefs.get(`${item.type}:${item.name}`) ?? new Set<string>()
    const resolvedDependencies = new Set<string>()
    const unresolvedDependencies: string[] = []

    for (const candidate of rawDependencies) {
      const normalized = toLowerOrEmpty(candidate)
      if (!normalized) {
        continue
      }
      if (normalized === item.name.toLowerCase()) {
        continue
      }
      if (!availableComponents.has(normalized)) {
        unresolvedDependencies.push(normalized)
        continue
      }
      resolvedDependencies.add(normalized)
    }

    if (unresolvedDependencies.length > 0) {
      console.warn(`⚠️  Missing local component references in ${item.name} (${item.type}): ${unresolvedDependencies.join(", ")}`)
    }

    item.registryDependencies = Array.from(resolvedDependencies).sort()
  })
    
    // Create registry with dynamic registry name
    const registry = {
      $schema: "https://ui.buildy.tw/schema/registry.json",
      items: allComponents,
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      registry: registryName
    }
    
    // Ensure output directory exists
    await fs.ensureDir(path.dirname(scanOptions.outputFile))
    
    // Write registry file
    await fs.writeFile(scanOptions.outputFile, JSON.stringify(registry, null, 2))
    
    spinner.succeed(CLI_MESSAGES.status.scannedComponents(allComponents.length))
    
    console.log(chalk.green(`✅ ${CLI_MESSAGES.success.registryGenerated(registryName)}`))
    console.log(`Output: ${scanOptions.outputFile}`)
    
    // Show summary
    const summary = allComponents.reduce((acc, comp) => {
      acc[comp.type] = (acc[comp.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    console.log(chalk.blue("\n📊 Component Summary:"))
    Object.entries(summary).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`)
    })
    
    // Show dependency summary
    const allDeps = new Set<string>()
    const allDevDeps = new Set<string>()
    allComponents.forEach(comp => {
      comp.dependencies.forEach(dep => allDeps.add(dep))
      comp.devDependencies.forEach(dep => allDevDeps.add(dep))
    })
    
    console.log(chalk.blue("\n📦 Dependencies Summary:"))
    console.log(`   Dependencies: ${allDeps.size} unique (${Array.from(allDeps).join(", ") || "none"})`)
    console.log(`   DevDependencies: ${allDevDeps.size} unique (${Array.from(allDevDeps).join(", ") || "none"})`)
    
  } catch (error) {
    handleError(error)
  }
}

async function scanDirectory(dirPath: string, type: string, ignorePatterns: string[] = []): Promise<RegistryItem[]> {
  if (!(await fs.pathExists(dirPath))) {
    return []
  }
  
  const components: RegistryItem[] = []
  
  // Find all TypeScript/JavaScript files
  const pattern = path.join(dirPath, "**/*.{ts,tsx,js,jsx}").replace(/\\/g, "/")
  const ignore = ignorePatterns.map(p => p.replace(/\\/g, "/"))
  const files = await glob(pattern, { windowsPathsNoEscape: true, ignore })
  
  for (const filePath of files) {
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/")
    const fileName = path.basename(filePath, path.extname(filePath))
    
    // Skip index files and files starting with underscore
    if (fileName === "index" || fileName.startsWith("_")) {
      continue
    }
    
    try {
      const content = await fs.readFile(filePath, "utf-8")
      const description = extractDescription(content)
      
      // Check if file has valid exports
      if (!hasValidExports(content)) {
        continue
      }
      
      components.push({
        name: fileName,
        type,
        description,
        dependencies: [],
        devDependencies: [],
        registryDependencies: [],
        files: [{
          path: relativePath,
          target: getTargetFromType(type)
        }]
      })
    } catch (error) {
      console.warn(`Warning: Could not process ${filePath}:`, (error as Error).message)
    }
  }
  
  return components
}

async function scanDirectoryFlat(dirPath: string, type: string, ignoreFiles: string[] = []): Promise<RegistryItem[]> {
  if (!(await fs.pathExists(dirPath))) {
    return []
  }
  
  const components: RegistryItem[] = []
  
  // Find only files in the root of the directory (no subdirectories)
  const pattern = path.join(dirPath, "*.{ts,tsx,js,jsx}").replace(/\\/g, "/")
  const files = await glob(pattern, { windowsPathsNoEscape: true })
  
  for (const filePath of files) {
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/")
    const fileName = path.basename(filePath, path.extname(filePath))
    
    // Skip specified files and files starting with underscore
    if (ignoreFiles.includes(fileName + path.extname(filePath)) || fileName.startsWith("_")) {
      continue
    }
    
    try {
      const content = await fs.readFile(filePath, "utf-8")
      const description = extractDescription(content)
      
      // Check if file has valid exports
      if (!hasValidExports(content)) {
        continue
      }
      
      components.push({
        name: fileName,
        type,
        description,
        dependencies: [],
        devDependencies: [],
        registryDependencies: [],
        files: [{
          path: relativePath,
          target: getTargetFromType(type)
        }]
      })
    } catch (error) {
      console.warn(`Warning: Could not process ${filePath}:`, (error as Error).message)
    }
  }
  
  return components
}

async function scanSingleFile(filePath: string, type: string): Promise<RegistryItem | null> {
  if (!(await fs.pathExists(filePath))) {
    return null
  }
  
  try {
    const content = await fs.readFile(filePath, "utf-8")
    const description = extractDescription(content)
    
    // Check if file has valid exports
    if (!hasValidExports(content)) {
      return null
    }
    
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/")
    const fileName = path.basename(filePath, path.extname(filePath))
    
    return {
      name: fileName,
      type,
      description,
      dependencies: [],
      devDependencies: [],
      registryDependencies: [],
      files: [{
        path: relativePath,
        target: getTargetFromType(type)
      }]
    }
  } catch (error) {
    console.warn(`Warning: Could not process ${filePath}:`, (error as Error).message)
    return null
  }
}

function extractDescription(content: string): string {
  // Look for JSDoc comment at the top of the file
  const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n\s*\*\//s)
  if (jsdocMatch) {
    return jsdocMatch[1].trim()
  }
  
  // Look for single line comment
  const commentMatch = content.match(/^\/\/\s*(.+)$/m)
  if (commentMatch) {
    return commentMatch[1].trim()
  }
  
  return ""
}

function hasValidExports(content: string): boolean {
  const sourceFile = ts.createSourceFile("index.ts", content, ts.ScriptTarget.Latest, true)
  let hasExports = false

  function visit(node: ts.Node) {
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node) || hasExportModifier(node)) {
      hasExports = true
      return
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return hasExports
}

async function analyzeComponentDependencies(files: ComponentFile[], cwd: string): Promise<{
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
      const content = await fs.readFile(filePath, "utf-8")
      
      // Parse TypeScript/JavaScript to extract imports
      const sourceFile = ts.createSourceFile(
        file.path,
        content,
        ts.ScriptTarget.Latest,
        true
      )
      
      const analysis = analyzeAST(sourceFile)
      
      // Merge dependencies
      analysis.dependencies.forEach(dep => allDependencies.add(dep))
      analysis.devDependencies.forEach(dep => allDevDependencies.add(dep))
      analysis.registryDependencies.forEach(dep => allRegistryDependencies.add(dep))
      
      // Use first found description
      if (analysis.description && !description) {
        description = analysis.description
      }
      
    } catch (error) {
      console.warn(CLI_MESSAGES.errors.failedToAnalyzeDeps(file.path), (error as Error).message)
    }
  }
  
  return {
    dependencies: Array.from(allDependencies),
    devDependencies: Array.from(allDevDependencies),
    description,
    registryDependencies: Array.from(allRegistryDependencies)
  }
}

function analyzeAST(sourceFile: ts.SourceFile): ASTAnalysis {
  const dependencies = new Set<string>()
  const devDependencies = new Set<string>()
  const registryDependencies = new Set<string>()
  let description: string | undefined
  let hasExports = false
  
  function visit(node: ts.Node) {
    // Analyze imports
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier
      if (ts.isStringLiteral(moduleSpecifier)) {
        const moduleName = moduleSpecifier.text

        for (const name of extractRegistryDependenciesFromImport(node)) {
          if (name) {
            registryDependencies.add(name)
          }
        }
        
        // Add only external dependencies using the same logic as generate-registry.ts
        if (isExternalDependency(moduleName)) {
          // Determine if it's a dev dependency based on common patterns
          if (isDevDependency(moduleName)) {
            devDependencies.add(moduleName)
          } else {
            dependencies.add(moduleName)
          }
        }
      }
    }
    
    // Analyze exports
    if (ts.isExportDeclaration(node)) {
      hasExports = true
    } else if (ts.isExportAssignment(node)) {
      hasExports = true
    } else if (hasExportModifier(node)) {
      hasExports = true
    }
    
    // Search for JSDoc comments
    const jsDocComment = getJSDocComment(node)
    if (jsDocComment && !description) {
      description = jsDocComment
    }
    
    ts.forEachChild(node, visit)
  }
  
  visit(sourceFile)
  
  return {
    dependencies: Array.from(dependencies),
    devDependencies: Array.from(devDependencies),
    description,
    registryDependencies: Array.from(registryDependencies),
    hasExports
  }
}

function isDevDependency(moduleName: string): boolean {
  return DEV_PATTERNS.some(pattern => moduleName.includes(pattern))
}

function hasExportModifier(node: ts.Node): boolean {
  if ('modifiers' in node && node.modifiers) {
    return (node.modifiers as ts.NodeArray<ts.Modifier>).some(
      mod => mod.kind === ts.SyntaxKind.ExportKeyword
    )
  }
  return false
}

function getJSDocComment(node: ts.Node): string | undefined {
  try {
    // Get JSDoc comments
    const jsDocTags = ts.getJSDocCommentsAndTags(node)
    
    for (const tag of jsDocTags) {
      if (ts.isJSDoc(tag) && tag.comment) {
        if (typeof tag.comment === 'string') {
          return tag.comment.trim()
        } else if (Array.isArray(tag.comment)) {
          return tag.comment.map(part => part.text).join('').trim()
        }
      }
    }
  } catch (error) {
    // Ignore JSDoc parsing errors
  }
  
  return undefined
}

function getTargetFromType(type: string): string {
  const folder = TYPE_TO_FOLDER[type as keyof typeof TYPE_TO_FOLDER]
  return folder || "components"
}

// TYPE_TO_FOLDER mapping:
// - "registry:ui" → "components/ui"
// - "registry:variants" → "variants"
// - "registry:lib" → "lib"

function normalizeDir(dir: string): string {
  return dir.replace(/^\.\//, "").replace(/\\/g, "/")
} 