import fs from "fs-extra"
import path from "path"
import chalk from "chalk"
import prompts from "prompts"
import { findConfig } from "./project.js"
import { initCommand } from "../commands/init.js"

export interface ValidationResult {
  isValid: boolean
  message?: string
  missingComponents?: string[]
}

/**
 * Check if utility registry is initialized (base requirement)
 */
export async function isUtilityRegistryInitialized(): Promise<boolean> {
  // Deprecated in core/form model. Always allow operations.
  return true
}

/**
 * Check if a specific registry can be used (requires utility as base)
 */
export async function canUseRegistry(registryType: string): Promise<ValidationResult> {
  // In the simplified core/form model, all registries are usable without prerequisites.
  return { isValid: true }
}

/**
 * Get list of available components in utility registry from all categories
 */
export async function getUtilityComponents(): Promise<string[]> {
  // Deprecated in core/form model. No prerequisite components required.
  return []
}

/**
 * Get detailed component information by category
 */
export async function getUtilityComponentsByCategory(): Promise<Record<string, string[]>> {
  // Deprecated in core/form model. No categorized utility prerequisites.
  return {}
}

/**
 * Validate if components can be installed in non-utility registry
 */
export async function validateComponentInstallation(
  components: string[], 
  registryType: string
): Promise<ValidationResult> {
  const packageJsonPath = path.join(process.cwd(), "package.json")
  if (!(await fs.pathExists(packageJsonPath))) {
    return {
      isValid: false,
      message: "No package.json found in the current directory. Run this command from your project root."
    }
  }

  const nodeMajorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10)
  if (Number.isNaN(nodeMajorVersion) || nodeMajorVersion < 18) {
    return {
      isValid: false,
      message: `Node.js 18+ is required. Current version: ${process.versions.node}`
    }
  }

  const existingConfig = await findConfig(registryType)
  if (!existingConfig) {
    const { runInit } = await prompts({
      type: "confirm",
      name: "runInit",
      message: "ui8kit.config.json not found. Run init now?",
      initial: true
    })

    if (runInit) {
      await initCommand({ registry: registryType })

      const configAfterInit = await findConfig(registryType)
      if (configAfterInit) {
        return { isValid: true }
      }
    }

    return {
      isValid: false,
      message: `ui8kit is not initialized. Run: npx ui8kit@latest init --registry ${registryType}`
    }
  }

  return { isValid: true }
}

/**
 * Show validation error and exit
 */
export function handleValidationError(result: ValidationResult): never {
  console.error(chalk.red("❌ Registry Validation Error:"))
  console.error(chalk.red(result.message))
  
  if (result.missingComponents && result.missingComponents.length > 0) {
    console.log(chalk.yellow("\n💡 Suggestion:"))
    console.log(`Install missing components first: ${chalk.cyan(`npx ui8kit add ${result.missingComponents.join(' ')}`)}\n`)
  }
  
  process.exit(1)
}

/**
 * Show utility components summary
 */
export async function showUtilityComponentsSummary(): Promise<void> {
  // Deprecated in core/form model. No summary to show.
} 