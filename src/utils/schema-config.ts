// Universal UI8Kit CLI configuration — contracts, not frameworks.

export const FRAMEWORKS = [
  "react",
  "svelte",
  "vue",
  "solid",
  "webcomponent",
  "templ",
  "latte",
  "twig",
  "jinja2",
  "none",
] as const

export type Framework = (typeof FRAMEWORKS)[number]

/** Runtime slice inside a digest registry (often equals framework for JS). */
export const RUNTIMES = [
  "react",
  "svelte",
  "vue",
  "solid",
  "webcomponent",
  "templ",
  "latte",
  "twig",
  "jinja2",
] as const

export type Runtime = (typeof RUNTIMES)[number]

export const COMPONENT_TYPES = [
  "registry:lib",
  "registry:utils",
  "registry:ui",
  "registry:component",
  "registry:composite",
  "registry:block",
  "registry:layout",
  "registry:variants",
  "registry:widget",
] as const

export type ComponentType = (typeof COMPONENT_TYPES)[number]

/**
 * Canonical folders under `{dir}/`.
 * Logical contract shared by all stacks; physical remap via config.paths.
 */
export const CANONICAL_PATHS = {
  lib: "lib",
  utils: "utils",
  components: "components",
  ui: "components/ui",
  blocks: "blocks",
  layouts: "layouts",
  variants: "variants",
  widgets: "widgets",
} as const

export type PathKey = keyof typeof CANONICAL_PATHS

/** Map registry item type → canonical path key / folder under dir */
export const TYPE_TO_FOLDER: Record<ComponentType, string> = {
  "registry:lib": CANONICAL_PATHS.lib,
  "registry:utils": CANONICAL_PATHS.utils,
  "registry:ui": CANONICAL_PATHS.ui,
  "registry:component": CANONICAL_PATHS.components,
  "registry:composite": CANONICAL_PATHS.components,
  "registry:block": CANONICAL_PATHS.blocks,
  "registry:layout": CANONICAL_PATHS.layouts,
  "registry:variants": CANONICAL_PATHS.variants,
  "registry:widget": CANONICAL_PATHS.widgets,
}

export const TYPE_TO_PATH_KEY: Record<ComponentType, PathKey> = {
  "registry:lib": "lib",
  "registry:utils": "utils",
  "registry:ui": "ui",
  "registry:component": "components",
  "registry:composite": "components",
  "registry:block": "blocks",
  "registry:layout": "layouts",
  "registry:variants": "variants",
  "registry:widget": "widgets",
}

export const SCHEMA_CONFIG = {
  schemaVersion: "http://json-schema.org/draft-07/schema#",
  baseUrl: "https://ui.buildy.tw/schema",
  cliContractVersion: "2.0.0",

  supportedFrameworks: FRAMEWORKS,
  supportedRuntimes: RUNTIMES,
  componentTypes: COMPONENT_TYPES,

  defaultFramework: "none" as Framework,
  defaultDir: "src",
  defaultGlobalCss: "src/index.css",

  defaultAliases: {
    "@": "./src",
    "@/lib": "./src/lib",
    "@/utils": "./src/utils",
    "@/components": "./src/components",
    "@/ui": "./src/components/ui",
    "@/blocks": "./src/blocks",
    "@/layouts": "./src/layouts",
    "@/variants": "./src/variants",
    "@/widgets": "./src/widgets",
  } as Record<string, string>,

  defaultRegistry: "@ui8kit",
  registryTypes: ["ui"] as const,
  defaultRegistryType: "ui" as const,

  /**
   * Default CDN bases (still overridable per-project via config.cdnBaseUrls
   * or --registry-url). Placeholders: none — full URLs.
   */
  cdnBaseUrls: [
    "https://unpkg.com/@ui8kit/registry@latest/r",
    "https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r",
    "https://raw.githubusercontent.com/ui8kit/core/refs/heads/main/packages/registry/r",
  ] as readonly string[],

  componentCategories: [
    "lib",
    "utils",
    "ui",
    "components",
    "blocks",
    "layouts",
    "variants",
    "widgets",
  ] as const,

  defaultDirectories: {
    dir: "./src",
    lib: "./src/lib",
    utils: "./src/utils",
    components: "./src/components",
    ui: "./src/components/ui",
    blocks: "./src/blocks",
    layouts: "./src/layouts",
    variants: "./src/variants",
    widgets: "./src/widgets",
  } as const,

  descriptions: {
    config: {
      title: "UI8Kit Configuration",
      description: "Universal UI8Kit CLI config (multi-runtime, path contracts)",
    },
    registry: {
      title: "UI8Kit Registry",
      description: "Registry schema for UI8Kit component system",
    },
    registryItem: {
      title: "UI8Kit Registry Item",
      description: "Schema for individual registry items",
    },
  } as const,

  fieldDescriptions: {
    schema: "JSON Schema URL",
    framework: "Project framework / stack hint",
    runtime: "Default registry runtime slice (react|svelte|templ|…)",
    typescript: "Whether the project uses TypeScript",
    globalCss: "Path to global styles entry (Tailwind)",
    dir: "Install root for kit folders (src, web/src, internal, …)",
    paths: "Optional remap of canonical folders under dir",
    aliases: "Path aliases for import rewrites",
    registry: "Default component registry name",
    componentsDir: "Deprecated: use dir + paths",
    libDir: "Deprecated: use dir + paths.lib",
    registryUrl: "Explicit registry CDN/base URL override",
    registryVersion: "Pin @latest → @version in CDN URLs",
    cdnBaseUrls: "Full ordered list of registry base URLs (replaces defaults when set)",
    strictCdn: "When registryUrl is set, do not fall back to other CDNs",
    importStyle: "How TS/TSX imports are rewritten: alias or package",
    registryName: "Registry name",
    registryHomepage: "Registry homepage URL",
    registryType: "Registry type (e.g., ui)",
    lastUpdated: "Last update timestamp",
    categories: "Available component categories",
    components: "Component metadata for quick lookup",
    items: "Full component definitions",
  } as const,

  packageAliases: {
    core: "@ui8kit/core",
  } as const,

  importStyle: {
    alias: "alias",
    package: "package",
  } as const,
} as const

export type RegistryType = (typeof SCHEMA_CONFIG.registryTypes)[number]
export type ImportStyle = (typeof SCHEMA_CONFIG.importStyle)[keyof typeof SCHEMA_CONFIG.importStyle]

export const TYPE_TO_FOLDER_LEGACY = TYPE_TO_FOLDER

export interface CdnResolutionOptions {
  registryUrl?: string
  registryVersion?: string
  strictCdn?: boolean
  /** Project-level CDN list; when set, replaces SCHEMA_CONFIG.cdnBaseUrls */
  cdnBaseUrls?: string[]
}

function normalizeCdnVersion(version?: string): string {
  if (!version) return ""
  const normalized = version.trim()
  if (!normalized) return ""
  return normalized.startsWith("@") ? normalized : `@${normalized}`
}

function applyRegistryVersion(baseUrl: string, version?: string): string {
  const normalizedVersion = normalizeCdnVersion(version)
  if (!normalizedVersion) return baseUrl
  return baseUrl.replace(/@latest(?=\/|$)/g, normalizedVersion)
}

function normalizeCdnBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

/**
 * Resolve ordered CDN base URLs.
 * Priority: explicit registryUrl → config.cdnBaseUrls → built-in defaults.
 * strictCdn + registryUrl → only that URL.
 */
export function getCdnUrls(_registryType: RegistryType, options: CdnResolutionOptions = {}): string[] {
  const defaults = (options.cdnBaseUrls?.length
    ? options.cdnBaseUrls
    : [...SCHEMA_CONFIG.cdnBaseUrls]
  ).map((url) => applyRegistryVersion(url, options.registryVersion))

  const resolved: string[] = []
  const explicitUrl = options.registryUrl
    ? normalizeCdnBaseUrl(
        applyRegistryVersion(normalizeCdnBaseUrl(options.registryUrl), options.registryVersion),
      )
    : ""

  if (explicitUrl) resolved.push(explicitUrl)

  if (!options.strictCdn || !explicitUrl) {
    resolved.push(...defaults)
  }

  return [...new Set(resolved)]
}

export function filterRealDependencies(dependencies: string[]): string[] {
  return dependencies.filter((dep) => {
    if (dep.startsWith("@/") || dep.startsWith("./") || dep.startsWith("../")) return false
    if (dep.startsWith("~/")) return false
    if (dep.startsWith("@ui8kit/") || dep.startsWith("ui8kit/")) return false
    if (dep.includes("\\") || (dep.includes("/") && !dep.startsWith("@") && !dep.includes("://"))) {
      return false
    }
    if (dep.trim() === "") return false
    if (dep.startsWith("file:")) return false
    return true
  })
}

export function isExternalDependency(moduleName: string): boolean {
  return (
    !moduleName.startsWith(".") &&
    !moduleName.startsWith("@/") &&
    !moduleName.startsWith("~/") &&
    !moduleName.startsWith("@ui8kit/") &&
    !moduleName.includes("\\") &&
    moduleName !== "" &&
    !moduleName.startsWith("file:")
  )
}

export function getSchemaRef(schemaName: string): string {
  return `${SCHEMA_CONFIG.baseUrl}/${schemaName}.json`
}

export function getSchemaUrl(schemaName?: string): string {
  if (schemaName) return getSchemaRef(schemaName)
  return `${SCHEMA_CONFIG.baseUrl}.json`
}

/** @deprecated use TYPE_TO_FOLDER + config.dir */
export function getInstallPath(registryType: RegistryType, componentType: string): string {
  const folder = TYPE_TO_FOLDER[componentType as ComponentType] || "components"
  return `src/${folder}`
}
