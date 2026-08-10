import path from "path"
import { Config, configSchema } from "../registry/schema.js"
import { ensureDir as fsEnsureDir, pathExists, readJson, writeJson } from "./fs.js"

const MODERN_CONFIG_NAME = "ui8kit.config.json"

export async function hasPackageJson(): Promise<boolean> {
  return pathExists(path.join(process.cwd(), "package.json"))
}

export async function isViteProject(): Promise<boolean> {
  const viteConfigFiles = ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"]
  for (const file of viteConfigFiles) {
    if (await pathExists(file)) return true
  }
  return false
}

export async function hasReact(): Promise<boolean> {
  const packageJsonPath = path.join(process.cwd(), "package.json")
  if (!(await pathExists(packageJsonPath))) return false
  const packageJson = await readJson<Record<string, any>>(packageJsonPath)
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
  return "react" in deps
}

export async function detectFrameworkHint(): Promise<string> {
  const packageJsonPath = path.join(process.cwd(), "package.json")
  if (!(await pathExists(packageJsonPath))) return "none"
  const packageJson = await readJson<Record<string, any>>(packageJsonPath)
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
  if ("svelte" in deps) return "svelte"
  if ("vue" in deps) return "vue"
  if ("solid-js" in deps) return "solid"
  if ("react" in deps) return "react"
  return "none"
}

export async function findConfig(registryType?: string): Promise<Config | null> {
  const rootConfig = await getConfig()
  if (rootConfig) return rootConfig

  const srcConfig = await getConfig("./src")
  if (srcConfig) return srcConfig

  if (registryType) {
    const registryConfig = await getConfig(`./${registryType}`)
    if (registryConfig) return registryConfig
  }

  return null
}

export async function getConfig(registryPath?: string): Promise<Config | null> {
  const baseDir = registryPath ? path.join(process.cwd(), registryPath) : process.cwd()
  const configPath = path.join(baseDir, MODERN_CONFIG_NAME)
  if (!(await pathExists(configPath))) return null

  try {
    const raw = await readJson<Record<string, any>>(configPath)
    // Soft-migrate legacy vite-react
    if (raw.framework === "vite-react") {
      raw.framework = "react"
      if (!raw.dir && raw.componentsDir) {
        raw.dir = "src"
      }
    }
    return configSchema.parse(raw)
  } catch (error) {
    console.error("❌ Invalid ui8kit.config.json:", (error as Error).message)
    return null
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const configPath = path.join(process.cwd(), MODERN_CONFIG_NAME)
  await fsEnsureDir(path.dirname(configPath))
  await writeJson(configPath, config, { spaces: 2 })
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fsEnsureDir(dirPath)
}
