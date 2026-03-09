import path from "path"
import ts from "typescript"
import { ImportStyle, SCHEMA_CONFIG } from "./schema-config.js"

const IMPORT_NODE_KIND = ts.SyntaxKind.ImportDeclaration
const PACKAGE_STYLE_IMPORT_GROUPS = ["components", "layouts", "blocks", "variants", "ui"]

function normalizeAliasKey(alias: string): string {
  return alias.replace(/\\/g, "/").replace(/\/+$/, "")
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/")
}

function normalizeAliasTarget(alias: string): string {
  return toPosix(alias).replace(/\/+$/, "")
}

function normalizeDefaultAliases(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [alias, target] of Object.entries(SCHEMA_CONFIG.defaultAliases)) {
    map.set(normalizeAliasKey(alias), normalizeAliasTarget(target))
  }
  return map
}

function normalizeConfiguredAliases(aliasMap: Record<string, string>): Map<string, string> {
  const normalized = new Map<string, string>()
  for (const [alias, target] of Object.entries(aliasMap)) {
    normalized.set(normalizeAliasKey(alias), normalizeAliasTarget(target))
  }
  return normalized
}

function pickAliasForImport(
  importPath: string,
  configuredAliases: Map<string, string>
): string | undefined {
  const pathValue = toPosix(importPath)
  if (!pathValue.startsWith("@/")) {
    return undefined
  }

  const trimmed = pathValue.slice(2)
  const [root] = trimmed.split("/")
  const rootAlias = `@/${root}`

  const directAlias = Array.from(configuredAliases.keys())
    .filter(alias => pathValue === alias || pathValue.startsWith(`${alias}/`))
    .sort((a, b) => b.length - a.length)[0]
  if (directAlias) {
    const aliasValue = configuredAliases.get(directAlias)
    if (!aliasValue || !aliasValue.startsWith("@/")) {
      return undefined
    }

    const remainder = pathValue.slice(directAlias.length).replace(/^\/+/, "")
    if (!remainder) {
      return aliasValue
    }

    const remainderParts = remainder.split("/")
    const targetParts = normalizeAliasKey(aliasValue).replace(/^@\//, "").split("/")
    const aliasTail = targetParts[targetParts.length - 1]
    const normalizedRemainder = (remainderParts[0] === aliasTail)
      ? remainderParts.slice(1).join("/")
      : remainder
    return normalizedRemainder ? `${aliasValue}/${normalizedRemainder}` : aliasValue
  }

  const defaultAliasCandidates = Array.from(normalizeDefaultAliases().keys())
    .filter(alias => pathValue === alias || pathValue.startsWith(`${alias}/`))
    .sort((a, b) => b.length - a.length)

  for (const defaultAlias of defaultAliasCandidates) {
    const defaultParts = normalizeAliasKey(defaultAlias).replace(/^@\//, "").split("/")
    const remainderFromDefault = trimmed.split("/").slice(defaultParts.length)
    if (remainderFromDefault.length === 0) {
      continue
    }

    const candidateAliasTail = remainderFromDefault[0]
    const candidateAlias = `@/${candidateAliasTail}`
    if (configuredAliases.has(candidateAlias)) {
      const remainderPath = remainderFromDefault.slice(1).join("/")
      return remainderPath ? `${candidateAlias}/${remainderPath}` : candidateAlias
    }
  }

  return undefined
}

function normalizeAliasImportPath(
  specifierText: string,
  aliasesMap: Map<string, string>
): string | undefined {
  const rewritten = pickAliasForImport(specifierText, aliasesMap)
  if (!rewritten || rewritten === normalizeAliasKey(specifierText)) {
    return undefined
  }
  return rewritten
}

function isComponentAliasImport(aliasPath: string): boolean {
  const match = aliasPath.startsWith("@/") ? aliasPath.slice(2) : ""
  if (!match) {
    return false
  }

  const firstSegment = match.split("/")[0]
  return PACKAGE_STYLE_IMPORT_GROUPS.includes(firstSegment)
}

function rewriteModuleSpecifier(
  specifierText: string,
  configuredAliases: Record<string, string>,
  importStyle: ImportStyle = "alias"
): string {
  if (!specifierText.startsWith("@/")) {
    return specifierText
  }

  const aliasesMap = normalizeConfiguredAliases(configuredAliases)
  const rewrittenAlias = normalizeAliasImportPath(specifierText, aliasesMap)
  if (!rewrittenAlias) {
    return specifierText
  }

  if (importStyle === "package" && isComponentAliasImport(rewrittenAlias)) {
    return SCHEMA_CONFIG.packageAliases.core
  }

  return rewrittenAlias
}

export function transformImports(
  content: string,
  aliases: Record<string, string>,
  importStyle: ImportStyle = "alias"
): string {
  const sourceFile = ts.createSourceFile("component.tsx", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  const importSpans: Array<{ start: number; end: number; replacement: string }> = []
  const configuredAliases = normalizeConfiguredAliases(aliases)

  function visit(node: ts.Node) {
    if (node.kind === IMPORT_NODE_KIND && ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier
      if (ts.isStringLiteral(moduleSpecifier)) {
        const value = moduleSpecifier.text
        const rewritten = rewriteModuleSpecifier(value, Object.fromEntries(configuredAliases), importStyle)
        if (rewritten !== value) {
          importSpans.push({
            start: moduleSpecifier.getStart(sourceFile),
            end: moduleSpecifier.getEnd(),
            replacement: `"${rewritten}"`
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  if (importSpans.length === 0) {
    return content
  }

  importSpans.sort((a, b) => b.start - a.start)
  let transformed = content
  for (const span of importSpans) {
    transformed = `${transformed.slice(0, span.start)}${span.replacement}${transformed.slice(span.end)}`
  }

  return transformed
}

export function transformCleanup(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    + "\n"
}

export function applyTransforms(
  content: string,
  aliases: Record<string, string>,
  importStyle: ImportStyle = "alias"
): string {
  const withImports = transformImports(content, aliases, importStyle)
  return transformCleanup(withImports)
}

export function shouldTransformFile(fileName: string): boolean {
  return [".ts", ".tsx"].includes(path.extname(fileName))
}
