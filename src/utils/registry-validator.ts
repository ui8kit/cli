import path from "path"
import prompts from "prompts"
import { findConfig } from "./project.js"
import { initCommand } from "../commands/init.js"
import { pathExists } from "./fs.js"

export interface ValidationResult {
  isValid: boolean
  message?: string
  missingComponents?: string[]
}

/**
 * Validate if components can be installed in non-utility registry
 */
export async function validateComponentInstallation(
  components: string[],
  registryType: string
): Promise<ValidationResult> {
  const packageJsonPath = path.join(process.cwd(), "package.json")
  if (!(await pathExists(packageJsonPath))) {
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
      message: `ui8kit is not initialized. Run: npx ui8kit@3 init --registry ${registryType}`
    }
  }

  return { isValid: true }
}

/**
 * Show validation error and exit
 */
export function handleValidationError(result: ValidationResult): never {
  console.error("❌ Registry Validation Error:")
  console.error(result.message)

  if (result.missingComponents && result.missingComponents.length > 0) {
    console.log("\n💡 Suggestion:")
    console.log(`Install missing components first: npx ui8kit add ${result.missingComponents.join(' ')}\n`)
  }

  process.exit(1)
}
