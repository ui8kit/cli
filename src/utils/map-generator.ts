import fs from "fs-extra"
import path from "path"
import * as ts from "typescript"

export interface UtilityMap {
  [utility: string]: string[]
}

export interface Ui8kitMapFile {
  version: string
  generatedAt: string
  map: UtilityMap
}

export interface GenerateMapResult {
  generated: boolean
  path?: string
}

export interface GenerateMapOptions {
  sourcePath: string
  outputPath: string
  skipMissing?: boolean
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
  const { sourcePath, outputPath, skipMissing = true } = options

  if (!(await fs.pathExists(sourcePath))) {
    if (skipMissing) {
      return { generated: false }
    }
    throw new Error(`Utility props map source not found: ${path.resolve(sourcePath)}`)
  }

  const content = await fs.readFile(sourcePath, "utf-8")
  const rawMap = parseUtilityMapSource(content)
  const map = normalizeUtilityMap(rawMap)

  const mapFile: Ui8kitMapFile = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    map
  }

  await fs.ensureDir(path.dirname(outputPath))
  await fs.writeJson(outputPath, mapFile, { spaces: 2 })
  return { generated: true, path: outputPath }
}

