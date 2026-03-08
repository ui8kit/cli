// Configuration for schema generation
// Centralized configuration file with all constants and defaults

export const SCHEMA_CONFIG = {
  // Base schema information
  schemaVersion: "http://json-schema.org/draft-07/schema#",
  baseUrl: "https://ui.buildy.tw/schema",
  
  // Framework configuration
  supportedFrameworks: ["vite-react"] as const,
  
  // Default aliases for path mapping
  defaultAliases: {
    "@": "./src",
    "@/components": "./src/components",
    "@/ui": "./src/components/ui",
    "@/layouts": "./src/layouts",
    "@/blocks": "./src/blocks",
    "@/lib": "./src/lib",
    "@/variants": "./src/variants"
  },
  
  // Registry configuration
  defaultRegistry: "@ui8kit",
  registryTypes: ["ui"] as const,

  // Default registry type
  defaultRegistryType: "ui" as const,
  
  // CDN base URLs (registryName will be substituted)
  cdnBaseUrls: [
    "https://unpkg.com/@ui8kit/registry@latest/r",
    "https://cdn.jsdelivr.net/npm/@ui8kit/registry@latest/r", 
    "https://raw.githubusercontent.com/buildy-ui/ui/main/packages/@ui8kit/registry/r"
  ] as const,
  
  // Component categories
  componentCategories: ["ui", "composite", "components", "layouts", "lib", "blocks", "variants"] as const,
  
  // Component types (should match registryItemTypeSchema)
  componentTypes: [
    "registry:lib",
    "registry:block", 
    "registry:component",
    "registry:ui",
    "registry:composite",
    "registry:layout",
    "registry:variants"
  ] as const,
  
  // Default directories structure
  // Source directories (where CLI scans for components)
  defaultDirectories: {
    components: "./src/components",
    lib: "./src/lib",
    layouts: "./src/layouts",
    blocks: "./src/blocks",
    variants: "./src/variants",
  } as const,

  // Utility map generation settings
  utilityMap: {
    sources: {
      mapFile: "./src/lib/utility-props.map.ts",
      runtimeFile: "./src/lib/utility-props.ts"
    },
    outputFile: "./packages/registry/ui8kit.map.json"
  } as const,
  
  // Schema descriptions and titles
  descriptions: {
    config: {
      title: "UI8Kit Configuration",
      description: "Configuration file for ui8kit CLI (UI8Kit structure)",
    },
    registry: {
      title: "UI8Kit Registry",
      description: "Registry schema for UI8Kit component system",
    },
    registryItem: {
      title: "UI8Kit Registry Item",
      description: "Schema for individual registry items in the UI8Kit component system",
    }
  } as const,
  
  // Field descriptions
  fieldDescriptions: {
    schema: "JSON Schema URL",
    framework: "Target framework",
    typescript: "Whether the project uses TypeScript",
    globalCss: "Path to global styles entry file",
    aliases: "Path aliases for imports in UI8Kit structure",
    registry: "Default component registry",
    componentsDir: "Directory where utility components will be installed",
    libDir: "Directory for utility libraries",
    registryName: "Registry name",
    registryHomepage: "Registry homepage URL",
    registryType: "Registry type (e.g., ui)",
    registryVersion: "Registry version",
    registryUrl: "Explicit registry URL override",
    strictCdn: "Disable fallback to built-in CDN URLs",
    importStyle: "How component imports are rewritten: alias or package",
    lastUpdated: "Last update timestamp",
    categories: "Available component categories",
    components: "Component metadata for quick lookup",
    items: "Full component definitions",
  } as const,
  packageAliases: {
    core: "@ui8kit/core"
  } as const,
  importStyle: {
    alias: "alias",
    package: "package"
  } as const
} as const

export type RegistryType = typeof SCHEMA_CONFIG.registryTypes[number]
export type ImportStyle = (typeof SCHEMA_CONFIG.importStyle)[keyof typeof SCHEMA_CONFIG.importStyle]

// Map component types to their target installation folders (on user's project side)
export const TYPE_TO_FOLDER = {
  "registry:ui": "components/ui",
  "registry:composite": "components",
  "registry:block": "blocks", 
  "registry:component": "components",
  "registry:lib": "lib",
  "registry:layout": "layouts",
  "registry:variants": "variants"
} as const

// Helper functions to generate URLs dynamically
export interface CdnResolutionOptions {
  registryUrl?: string
  registryVersion?: string
  strictCdn?: boolean
}

function normalizeCdnVersion(version?: string): string {
  if (!version) {
    return ""
  }
  const normalized = version.trim()
  if (!normalized) {
    return ""
  }
  return normalized.startsWith("@") ? normalized : `@${normalized}`
}

function applyRegistryVersion(baseUrl: string, version?: string): string {
  const normalizedVersion = normalizeCdnVersion(version)
  if (!normalizedVersion) {
    return baseUrl
  }
  return baseUrl.replace(/@latest(?=\/|$)/g, normalizedVersion)
}

export function getCdnUrls(_registryType: RegistryType, options: CdnResolutionOptions = {}): string[] {
  const baseUrls = SCHEMA_CONFIG.cdnBaseUrls.map(url => applyRegistryVersion(url, options.registryVersion))
  const resolvedUrls: string[] = []
  const explicitUrl = options.registryUrl
    ? normalizeCdnBaseUrl(applyRegistryVersion(normalizeCdnBaseUrl(options.registryUrl), options.registryVersion))
    : ""

  if (explicitUrl) {
    resolvedUrls.push(explicitUrl)
  }

  if (!options.strictCdn || !explicitUrl) {
    resolvedUrls.push(...baseUrls)
  }

  return [...new Set(resolvedUrls)]
}

function normalizeCdnBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

export function getInstallPath(registryType: RegistryType, componentType: string): string {
  // Deprecated: install path should be resolved via project config. This remains only for backward compatibility.
  const folder = TYPE_TO_FOLDER[componentType as keyof typeof TYPE_TO_FOLDER]
  if (componentType === "registry:lib") {
    return SCHEMA_CONFIG.defaultDirectories.lib
  }
  return `src/${folder}`
}

// Helper function to filter real npm dependencies (exclude local aliases and paths)
export function filterRealDependencies(dependencies: string[]): string[] {
  return dependencies.filter(dep => {
    // Skip local aliases that start with @/ or ./
    if (dep.startsWith('@/') || dep.startsWith('./') || dep.startsWith('../')) {
      return false
    }
    
    // Skip tilde aliases
    if (dep.startsWith('~/')) {
      return false
    }
    
    // Skip internal workspace packages
    if (dep.startsWith('@ui8kit/') || dep.startsWith('ui8kit/')) {
      return false
    }
    
    // Skip relative paths and Windows paths
    if (dep.includes('\\') || (dep.includes('/') && !dep.startsWith('@') && !dep.includes('://'))) {
      return false
    }
    
    // Skip empty strings
    if (dep.trim() === '') {
      return false
    }
    
    // Skip file: protocol
    if (dep.startsWith('file:')) {
      return false
    }
    
    return true
  })
}

// Helper function to check if a module is an external dependency
export function isExternalDependency(moduleName: string): boolean {
  return !moduleName.startsWith(".") && 
         !moduleName.startsWith("@/") && 
         !moduleName.startsWith("~/") &&
         !moduleName.startsWith("@ui8kit/") &&
         !moduleName.includes("\\") &&
         moduleName !== "" &&
         !moduleName.startsWith("file:")
}

// Helper function to get schema reference URL
export function getSchemaRef(schemaName: string): string {
  return `${SCHEMA_CONFIG.baseUrl}/${schemaName}.json`
}

// Helper function to get full schema URL
export function getSchemaUrl(schemaName?: string): string {
  if (schemaName) {
    return getSchemaRef(schemaName)
  }
  return `${SCHEMA_CONFIG.baseUrl}.json`
} 