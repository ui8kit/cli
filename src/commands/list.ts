import chalk from "chalk"
import { Component } from "../registry/schema.js"
import { getAllComponents } from "../registry/api.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { logger } from "../utils/logger.js"
import { CdnResolutionOptions, SCHEMA_CONFIG, type RegistryType } from "../utils/schema-config.js"

const LIST_EXCLUDED_COMPONENT_TYPES = ["registry:variants", "registry:lib"]

interface ListOptions {
  registry?: string
  json?: boolean
  cache?: boolean
  registryUrl?: string
  registryVersion?: string
  strictCdn?: boolean
}

export async function listCommand(options: ListOptions = {}) {
  const registryType = resolveRegistryType(options.registry)
  const cdnResolution: CdnResolutionOptions = {
    registryUrl: options.registryUrl,
    registryVersion: options.registryVersion,
    strictCdn: options.strictCdn
  }
  const requestOptions = {
    excludeTypes: LIST_EXCLUDED_COMPONENT_TYPES,
    noCache: options.cache === false,
    cdn: cdnResolution
  }

  try {
    const components = await getAllComponents(registryType, requestOptions)

    if (options.json) {
      console.log(JSON.stringify(components, null, 2))
      return
    }

    const byType = new Map<string, Component[]>()
    for (const component of components) {
      const group = byType.get(component.type) ?? []
      group.push(component)
      byType.set(component.type, group)
    }

    const sortedGroups = Array.from(byType.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    if (sortedGroups.length === 0) {
      logger.warn(CLI_MESSAGES.errors.registryTempUnavailable)
      return
    }

    logger.info(CLI_MESSAGES.info.listingComponents)
    for (const [type, group] of sortedGroups) {
      const entries = group.sort((a, b) => a.name.localeCompare(b.name))
      console.log(chalk.cyan(`${type} (${entries.length} components)`))
      for (const component of entries) {
        const description = component.description ? chalk.dim(component.description) : ""
        console.log(chalk.white(`  ${component.name.padEnd(14)}`) + description)
      }
      console.log("")
    }
  } catch (error) {
    logger.error((error as Error).message)
  }
}

function resolveRegistryType(registryInput?: string): RegistryType {
  if (!registryInput) {
    return SCHEMA_CONFIG.defaultRegistryType
  }

  if (SCHEMA_CONFIG.registryTypes.includes(registryInput as RegistryType)) {
    return registryInput as RegistryType
  }

  logger.warn(`⚠️  Unknown registry type: ${registryInput}`)
  logger.warn(`Available registries: ${SCHEMA_CONFIG.registryTypes.join(", ")}`)
  return SCHEMA_CONFIG.defaultRegistryType
}

