import { type ZodError } from "zod"
import chalk from "chalk"
import { CLI_MESSAGES } from "./cli-messages.js"

export type ErrorSuggestion = string

export class Ui8kitError extends Error {
  suggestion?: ErrorSuggestion

  constructor(message: string, suggestion?: ErrorSuggestion) {
    super(message)
    this.name = this.constructor.name
    this.suggestion = suggestion
  }
}

export class RegistryNotFoundError extends Ui8kitError {
  constructor(name: string, registry: string) {
    super(
      `Component "${name}" was not found in ${registry} registry.`,
      CLI_MESSAGES.info.tryListComponents(registry)
    )
  }
}

export class ConfigNotFoundError extends Ui8kitError {
  constructor(registry: string) {
    super(
      `ui8kit config not found for registry "${registry}".`,
      `Run: npx ui8kit@latest init --registry ${registry}`
    )
  }
}

export class RegistryFetchError extends Ui8kitError {
  constructor(message: string, suggestion?: string) {
    super(message, suggestion)
  }
}

export class ConfigParseError extends Ui8kitError {
  constructor(path: string, details?: string) {
    super(
      `Invalid ui8kit config at "${path}".`,
      details ? `Config parse error: ${details}` : "Open the file and fix the JSON format."
    )
  }
}

export class NetworkError extends Ui8kitError {
  constructor(url: string, statusCode?: number) {
    super(
      `Network request failed for ${url}.`,
      statusCode
        ? `HTTP status: ${statusCode}. Retry with --retry to try multiple CDN attempts.`
        : "Check internet connection and retry."
    )
  }
}

export function handleError(error: unknown): never {
  if (error instanceof Ui8kitError) {
    if (error.message) {
      console.error(chalk.red(error.message))
    }

    if (error.suggestion) {
      console.log(chalk.yellow(`💡 ${error.suggestion}`))
    }

    process.exit(1)
  }

  if (isZodError(error)) {
    console.error(chalk.red("❌ Configuration validation error:"))
    error.errors.forEach(issue => {
      const path = issue.path.join(".") || "root"
      console.log(chalk.yellow(`  - ${path}: ${issue.message}`))
    })
    process.exit(1)
  }

  console.error(chalk.red("❌ Unexpected error:"))
  console.error(chalk.red((error as Error).message ?? String(error)))
  process.exit(1)
}

export function isZodError(error: unknown): error is ZodError {
  return Boolean(error && typeof error === "object" && "issues" in (error as Record<string, unknown>))
}
