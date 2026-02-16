import fs from "fs-extra"
import path from "path"
import { Config, configSchema } from "../registry/schema.js"

const MODERN_CONFIG_NAME = "ui8kit.config.json"

export async function isViteProject(): Promise<boolean> {
  const viteConfigFiles = [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mts",
    "vite.config.mjs"
  ]
  
  for (const file of viteConfigFiles) {
    if (await fs.pathExists(file)) {
      return true
    }
  }
  
  return false
}

export async function hasReact(): Promise<boolean> {
  const packageJsonPath = path.join(process.cwd(), "package.json")
  
  if (!(await fs.pathExists(packageJsonPath))) {
    return false
  }
  
  const packageJson = await fs.readJson(packageJsonPath)
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  }
  
  return "react" in deps
}

/**
 * Find configuration for the project (prefer ./src)
 */
export async function findConfig(_registryType?: string): Promise<Config | null> {
  // Prefer config inside ./src
  const srcConfig = await getConfig("./src")
  if (srcConfig) return srcConfig

  // Backward compatibility: ./ui or legacy registry folders
  if (_registryType) {
    const registryConfig = await getConfig(`./${_registryType}`)
    if (registryConfig) return registryConfig
  }

  // Fallback to project root
  return await getConfig()
}

export async function getConfig(registryPath?: string): Promise<Config | null> {
  const baseDir = registryPath ? path.join(process.cwd(), registryPath) : process.cwd()
  const configPath = path.join(baseDir, MODERN_CONFIG_NAME)
  if (!(await fs.pathExists(configPath))) {
    return null
  }
  
  try {
    const config = await fs.readJson(configPath)
    return configSchema.parse(config)
  } catch (error) {
    console.error("❌ Invalid ui8kit.config.json:", (error as Error).message)
    return null
  }
}

export async function saveConfig(config: Config, registryPath?: string): Promise<void> {
  const configPath = registryPath
    ? path.join(process.cwd(), registryPath, MODERN_CONFIG_NAME)
    : path.join(process.cwd(), MODERN_CONFIG_NAME)
  
  // Ensure directory exists
  await fs.ensureDir(path.dirname(configPath))
  
  await fs.writeJson(configPath, config, { spaces: 2 })
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath)
} 