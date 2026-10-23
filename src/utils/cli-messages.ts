import { registryMajorSuffix } from "./schema-config.js"
// Centralized CLI messages and user-facing strings
export const CLI_MESSAGES = {
  // Error messages
  errors: {
    noComponentsSpecified: "Please specify at least one component to add.",
    notInitialized: "ui8kit is not initialized in this project. Run: npx ui8kit init",
    notViteProject: "Vite was not detected (optional; init does not require it).",
    reactNotInstalled: "React was not detected (optional; use --framework).",
    buildFailed: "Build failed:",
    scanFailed: "Scan failed:",
    registryTempUnavailable: "registry temporarily unavailable",
    noCDNFound: (registryType: string) => `No working ${registryType} CDN found`,
    componentNotFound: (name: string, registryType: string) => `Component "${name}" not found in ${registryType} registry`,
    unknownComponentType: (type: string) => `Unknown component type: ${type}`,
    fileNotFound: (path: string) => `File not found: ${path}`,
    invalidConfig: "Invalid ui8kit.config.json:",
    failedToInstall: (name: string, registryType: string) => `Failed to install ${name} from ${registryType}`,
    failedToFetch: (registryType: string) => `Failed to fetch components from ${registryType}`,
    failedToFetchComponent: (name: string, registryType: string) => `Failed to fetch ${name} from ${registryType}:`,
    failedToAnalyzeDeps: (path: string) => `Warning: Could not analyze dependencies for ${path}:`,
    dependenciesFailed: "Failed to install dependencies",
    couldNotInstallDeps: (name: string) => `Warning: Could not install some dependencies for ${name}`,
    noLocalInstall: "No installed local components were found in this project.",
    invalidRegistryForDiff: "Could not load registry data for diff check.",
    cacheClearFailed: "Could not clear cache."
  },

  // Success messages
  success: {
    initialized: (registryName: string) => `UI8Kit ${registryName} structure initialized successfully!`,
    setupComplete: (registryName: string) => `UI8Kit ${registryName} Setup complete!`,
    installed: (name: string, registryType: string) => `Installed ${name} from ${registryType}`,
    allInstalled: (registryType: string) => `All ${registryType} components installed successfully!`,
    componentsInstalled: "Components installed successfully!",
    depsInstalled: "Dependencies installed",
    registryBuilt: "Registry built successfully!",
    schemasGenerated: "Schema files generated successfully!",
    registryGenerated: (registryName: string) => `${registryName} registry generated successfully!`,
    depsAvailable: "All dependencies already available",
    cacheCleared: "UI8Kit cache cleared successfully."
  },

  // Info messages
  info: {
    tryListComponents: (registryType: string) => `Run "npx ui8kit@3 list --registry ${registryType}" to list available components`,
    initializing: (registryName: string) => `Initializing UI8Kit in your project (${registryName} registry)...`,
    installing: (registryName: string) => `Installing from ${registryName} registry...`,
    installingAll: (registryName: string) => `Installing all available components from ${registryName} registry...`,
    retryEnabled: "Aggressive retry mode enabled (3 attempts per request)",
    fetchingComponentList: (registryType: string) => `Fetching component list from ${registryType}...`,
    fetchingRegistry: (registryType: string) => `Fetching ${registryType} registry index`,
    scanningComponents: (registryName: string) => `Scanning ${registryName} components...`,
    building: "Building registry...",
    processingComponents: "Processing components...",
    scanningDirectories: "Scanning directories...",
    analyzingDeps: "Found {count} components, analyzing dependencies...",
    installationCancelled: "Initialization cancelled.",
    workspaceDepsDetected: "Workspace dependency detected. Installing individually...",
    checkingConnection: "Checking internet connection...",
    testing: (registryType: string, baseUrl: string) => `Testing ${registryType} CDN: ${baseUrl}`,
    using: (registryType: string, baseUrl: string) => `Using ${registryType} CDN: ${baseUrl}`,
    loading: (name: string, registryType: string, folder: string, type: string) => 
      `Loading ${name} from /${registryType}/${folder}/ (type: ${type})`,
    fetching: (registryType: string, url: string) => `Fetching from ${registryType}: ${url}`,
    listingComponents: "Listing available components",
    fetchingUrl: "Fetching component from:",
    fetchingUrlWithRetry: "Fetching component from URL with retry:",
    checkingForUpdates: "Checking for component updates...",
    localDiffSummary: "Local components compared with registry.",
  },

  // Prompts
  prompts: {
    globalCss: "Where is your global CSS / Tailwind entry?",
    aliasComponents: "Components alias (e.g. @/components)",
    overwrite: (registryName: string) =>
      `UI8Kit is already initialized for ${registryName} registry. Overwrite configuration?`,
  },

  // Examples and help text
  examples: {
    add: [
      "Example: npx ui8kit@3 add button input",
      "Example: npx ui8kit@3 add button",
      "Example: npx ui8kit@3 add all  # Install all components",
            "Example: npx ui8kit@3 add --retry  # Enable retry for unreliable connections",
      'Example: npx ui8kit@3 add "https://example.com/component.json"'
    ],
    init: [
      `npx ui8kit@3 add button - Add a button component`,
      `npx ui8kit@3 add button input select - Add multiple components`,
      `npx ui8kit@3 add --all - Add all components`,
      `npx ui8kit@3 add "https://example.com/component.json" - Add from external URL`
    ],
    troubleshooting: [
      "Check your internet connection",
      "Use --retry flag: npx ui8kit@3 add --all --retry",
      "Use VPN if available",
      "Install from URL: npx ui8kit@3 add 'https://...'",
      `Browse items: https://cdn.jsdelivr.net/npm/@ui8kit/registry${registryMajorSuffix()}/r/<runtime>/index.json`
    ]
  },

  // Directory descriptions
  directories: {
    lib: "Utils, helpers, functions",
    variants: "CVA variant configurations",
    "components/ui": "UI components",
    components: "Complex components",
    layouts: "Page layouts and structures",
    blocks: "Component blocks",
  },

  // Spinners and status
  status: {
    installing: (name: string, registryType: string) => `Installing ${name} from ${registryType}...`,
    wouldInstall: (name: string, registryType: string) => `Would install: ${name} from ${registryType}`,
    foundComponents: (count: number, registryType: string) => `Found ${count} components in ${registryType}`,
    wouldInstallFrom: (registryType: string) => `Would install from ${registryType}:`,
    builtComponents: (count: number) => `Built ${count} components`,
    scannedComponents: (count: number) => `Scanned ${count} components`,
    skipped: (fileName: string) => `Skipped ${fileName} (already exists, use --force to overwrite)`,
  }
}

// Formatted output helpers
export function formatInstallationSummary(registryType: string, successful: number, failed: number): string {
  return `Installation Summary:
   Registry: ${registryType}
   ✅ Successful: ${successful}
   ❌ Failed: ${failed}`
}

export function formatComponentSummary(items: Array<{type: string}>): string {
  const summary: Record<string, number> = {}
  items.forEach(item => {
    summary[item.type] = (summary[item.type] || 0) + 1
  })
  return Object.entries(summary).map(([type, count]) => `   ${type}: ${count}`).join("\n")
}
