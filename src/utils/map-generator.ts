import fs from "fs-extra"
import path from "path"
import * as ts from "typescript"

export interface UtilityMap {
  [utility: string]: string[]
}

export type UtilityClassList = string[]

export interface Ui8kitMapFile {
  version: string
  generatedAt: string
  map: UtilityClassList
}

export interface GenerateMapResult {
  generated: boolean
  path?: string
}

export interface GenerateMapOptions {
  sourcePath: string
  runtimeSourcePath?: string
  outputPath: string
  skipMissing?: boolean
}

interface RuntimeExpansionRules {
  flexDirections: Set<string>
  gapSemantic: Record<string, string>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function parseJsonCandidate(content: string): unknown {
  const trimmed = content.trim()
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function parseObjectValue(node: ts.Node): unknown {
  if (ts.isStringLiteral(node)) {
    return node.text
  }

  if (ts.isNumericLiteral(node)) {
    return node.text
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(parseObjectValue)
  }

  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, unknown> = {}
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue
      }
      let key: string | null = null
      if (ts.isStringLiteralLike(property.name) || ts.isNumericLiteral(property.name)) {
        key = property.name.text
      } else if (ts.isIdentifier(property.name)) {
        key = property.name.text
      }
      if (!key) {
        continue
      }
      result[key] = parseObjectValue(property.initializer)
    }
    return result
  }

  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return parseObjectValue(node.expression)
  }

  if (ts.isParenthesizedExpression(node)) {
    return parseObjectValue(node.expression)
  }

  return undefined
}

function extractExportedObject(source: string): unknown | null {
  const sourceFile = ts.createSourceFile(
    "utility-props.map.ts",
    source,
    ts.ScriptTarget.Latest,
    true
  )

  let extracted: unknown | null = null

  const visit = (node: ts.Node) => {
    if (extracted !== null) {
      return
    }

    if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      if (!isExported) {
        return
      }

      for (const declaration of node.declarationList.declarations) {
        if (!declaration.initializer) {
          continue
        }
        extracted = parseObjectValue(declaration.initializer)
        if (extracted !== undefined) {
          return
        }
      }
      return
    }

    if (ts.isExportAssignment(node) && node.expression) {
      extracted = parseObjectValue(node.expression)
      return
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return extracted
}

export function normalizeUtilityMap(raw: unknown): UtilityMap {
  if (!isPlainObject(raw)) {
    throw new Error("Invalid utility map shape: expected object with utility keys")
  }

  const normalized: UtilityMap = {}
  const errors: string[] = []

  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== "string" || !key.trim()) {
      errors.push(`Invalid utility key: ${String(key)}`)
      continue
    }

    if (!Array.isArray(value) || !value.every(item => typeof item === "string")) {
      errors.push(`Utility "${key}" expects string[]`)
      continue
    }

    const uniqueValues = [...new Set(value.map(item => item.trim()))]
      .filter(item => item.length > 0)
      .sort()
    normalized[key.trim()] = uniqueValues
  }

  if (errors.length > 0) {
    throw new Error(`Invalid utility map shape: ${errors.join("; ")}`)
  }

  const sortedKeys = Object.keys(normalized).sort()
  const ordered: UtilityMap = {}
  for (const key of sortedKeys) {
    ordered[key] = normalized[key]
  }
  return ordered
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map(item => (typeof item === "string" || typeof item === "number" ? String(item).trim() : ""))
    .filter(item => item.length > 0)
}

function toStringRecord(raw: unknown): Record<string, string> {
  if (!isPlainObject(raw)) {
    return {}
  }

  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key === "string" && typeof value === "string") {
      const normalizedValue = value.trim()
      if (key.trim() && normalizedValue.length > 0) {
        result[key.trim()] = normalizedValue
      }
    }
  }
  return result
}

function parseRuntimeExpansionRules(content: string): RuntimeExpansionRules {
  const sourceFile = ts.createSourceFile(
    "utility-props.ts",
    content,
    ts.ScriptTarget.Latest,
    true
  )

  const rules: RuntimeExpansionRules = {
    flexDirections: new Set<string>(),
    gapSemantic: {}
  }

  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue
        }

        const value = parseObjectValue(declaration.initializer)
        if (declaration.name.text === "FLEX_DIR_VALUES") {
          const values = toStringArray(value)
          rules.flexDirections = new Set(values)
        }

        if (declaration.name.text === "GAP_SEMANTIC") {
          rules.gapSemantic = toStringRecord(value)
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return rules
}

function expandUtilityValue(utility: string, rawValue: string, rules: RuntimeExpansionRules): string[] {
  const value = rawValue.trim()
  if (value.length === 0) {
    return [utility]
  }

  if (utility === "flex" && rules.flexDirections.has(value)) {
    return ["flex", `flex-${value}`]
  }

  if (utility === "gap" && Object.prototype.hasOwnProperty.call(rules.gapSemantic, value)) {
    return [`gap-${rules.gapSemantic[value]}`]
  }

  return [`${utility}-${value}`]
}

function buildFlatMap(utilityMap: UtilityMap, rules: RuntimeExpansionRules): UtilityClassList {
  const flattened: string[] = []

  for (const [utility, rawValues] of Object.entries(utilityMap)) {
    const normalizedUtility = utility.trim()
    if (!normalizedUtility) {
      continue
    }

    for (const rawValue of rawValues) {
      if (typeof rawValue !== "string") {
        continue
      }
      for (const value of expandUtilityValue(normalizedUtility, rawValue, rules)) {
        const normalizedValue = value.trim()
        if (normalizedValue.length > 0) {
          flattened.push(normalizedValue)
        }
      }
    }
  }

  return [...new Set(flattened)].sort()
}

export function parseUtilityMapSource(content: string): unknown {
  const fromJson = parseJsonCandidate(content)
  if (fromJson !== null) {
    return fromJson
  }

  const fromExport = extractExportedObject(content)
  if (fromExport !== null) {
    return fromExport
  }

  throw new Error("Could not parse utility props map source")
}

export async function generateMap(options: GenerateMapOptions): Promise<GenerateMapResult> {
  const {
    sourcePath,
    runtimeSourcePath,
    outputPath,
    skipMissing = true
  } = options

  if (!(await fs.pathExists(sourcePath))) {
    if (skipMissing) {
      return { generated: false }
    }
    throw new Error(`Utility props map source not found: ${path.resolve(sourcePath)}`)
  }

  const content = await fs.readFile(sourcePath, "utf-8")
  const rawMap = parseUtilityMapSource(content)
  const map = normalizeUtilityMap(rawMap)
  let runtimeRules: RuntimeExpansionRules = {
    flexDirections: new Set<string>(),
    gapSemantic: {}
  }

  if (runtimeSourcePath && await fs.pathExists(runtimeSourcePath)) {
    const runtimeContent = await fs.readFile(runtimeSourcePath, "utf-8")
    runtimeRules = parseRuntimeExpansionRules(runtimeContent)
  }

  const flattenedMap = buildFlatMap(map, runtimeRules)

  const mapFile: Ui8kitMapFile = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    map: flattenedMap
  }

  await fs.ensureDir(path.dirname(outputPath))
  await fs.writeJson(outputPath, mapFile, { spaces: 2 })
  return { generated: true, path: outputPath }
}

