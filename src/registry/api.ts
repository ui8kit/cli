import fetch from "node-fetch"
import { Component, componentSchema } from "./schema.js"
import { SCHEMA_CONFIG, TYPE_TO_FOLDER, getCdnUrls, type RegistryType, type CdnResolutionOptions } from "../utils/schema-config.js"
import { logger } from "../utils/logger.js"
import { getCachedJson, setCachedJson } from "../utils/cache.js"

const REGISTRY_INDEX_CACHE_TTL_MS = 3_600_000

const registryCache = new Map<RegistryType, {
  workingCDN: string | null
  registryIndex: any
}>()

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_RETRIES = 1
const RETRY_DELAY_MS = 1200

export interface RegistryFetchOptions {
  excludeTypes?: string[]
  maxRetries?: number
  timeoutMs?: number
  noCache?: boolean
  cdn?: CdnResolutionOptions
}

export function getRegistryCdnState(
  registryType: RegistryType,
  options: RegistryFetchOptions = {}
): { workingCDN: string | null; urls: string[] } {
  const cache = getRegistryCache(registryType)
  return {
    workingCDN: cache.workingCDN,
    urls: getCdnUrls(registryType, options.cdn)
  }
}

export function isUrl(path: string): boolean {
  try {
    new URL(path)
    return true
  } catch {
    return false
  }
}

function getRegistryCache(registryType: RegistryType) {
  if (!registryCache.has(registryType)) {
    registryCache.set(registryType, {
      workingCDN: null,
      registryIndex: null
    })
  }
  return registryCache.get(registryType)!
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchJsonWithRetry(url: string, maxRetries: number, timeoutMs: number): Promise<any> {
  let attempt = 0
  let lastError: unknown

  while (attempt < maxRetries) {
    attempt += 1
    try {
      return await fetchJsonWithTimeout(url, timeoutMs)
    } catch (error) {
      lastError = error
      if (attempt >= maxRetries) {
        break
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed")
}

async function fetchFromRegistryPath(
  requestPath: string,
  registryType: RegistryType,
  options: RegistryFetchOptions = {}
): Promise<any> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRetries = Math.max(1, options.maxRetries ?? DEFAULT_MAX_RETRIES)
  const cache = getRegistryCache(registryType)
  const cdnUrls = getCdnUrls(registryType, options.cdn)

  const orderedUrls = cache.workingCDN
    ? [cache.workingCDN, ...cdnUrls.filter(url => url !== cache.workingCDN)]
    : [...cdnUrls]

  let lastError: unknown
  for (const baseUrl of orderedUrls) {
    try {
      const data = await fetchJsonWithRetry(`${baseUrl}/${requestPath}`, maxRetries, timeoutMs)
      if (cache.workingCDN !== baseUrl) {
        cache.registryIndex = null
      }
      cache.workingCDN = baseUrl
      return data
    } catch (error) {
      lastError = error
      if (cache.workingCDN === baseUrl) {
        cache.workingCDN = null
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`No working ${registryType} CDN found`)
}

async function getRegistryIndex(registryType: RegistryType, options: RegistryFetchOptions = {}): Promise<any> {
  if (cacheStateHasIndex(registryType, options)) {
    return getCachedInMemory(registryType)
  }

  const cached = await getCachedJson(
    `${registryType}/index.json`,
    { noCache: options.noCache, ttlMs: REGISTRY_INDEX_CACHE_TTL_MS }
  )
  if (cached) {
    setCachedInMemory(registryType, cached)
    return cached
  }

  const cache = getRegistryCache(registryType)

  cache.registryIndex = await fetchFromRegistryPath("index.json", registryType, options)
  await setCachedJson(
    `${registryType}/index.json`,
    cache.registryIndex,
    { ttlMs: REGISTRY_INDEX_CACHE_TTL_MS }
  )
  return cache.registryIndex
}

async function getComponentByType(
  name: string,
  registryType: RegistryType,
  options: RegistryFetchOptions = {}
): Promise<Component | null> {
  const normalizedName = name.toLowerCase()
  const cachedComponent = await getCachedJson(
    `${registryType}/components/${normalizedName}.json`,
    { noCache: options.noCache, ttlMs: REGISTRY_INDEX_CACHE_TTL_MS }
  )
  if (cachedComponent) {
    try {
      return componentSchema.parse(cachedComponent)
    } catch (error) {
      logger.debug(`Invalid cached component for ${name}, refetching`)
    }
  }

  try {
    const index = await getRegistryIndex(registryType, options)
    const excludeTypes = options.excludeTypes ?? []
    const componentInfo = index.components?.find(
      (c: any) =>
        typeof c?.name === "string" &&
        c.name.toLowerCase() === normalizedName &&
        !excludeTypes.includes(c.type)
    )
    if (!componentInfo) {
      logger.debug(`Component ${name} not found in ${registryType} registry`)
      return null
    }

    const folder =
      componentInfo.type === "registry:variants"
        ? "components/variants"
        : TYPE_TO_FOLDER[componentInfo.type as keyof typeof TYPE_TO_FOLDER]
    if (!folder) {
      logger.debug(`Unknown component type: ${componentInfo.type}`)
      return null
    }

    logger.debug(`Loading ${name} from /${folder}/ (type: ${componentInfo.type})`)
    const data = await fetchFromRegistryPath(`${folder}/${name}.json`, registryType, options)
    await setCachedJson(`${registryType}/components/${normalizedName}.json`, data, { ttlMs: REGISTRY_INDEX_CACHE_TTL_MS })
    return componentSchema.parse(data)
  } catch (error) {
    logger.debug(`Failed to get component by type: ${(error as Error).message}`)
    return null
  }
}

export async function getComponent(
  name: string,
  registryType: RegistryType = SCHEMA_CONFIG.defaultRegistryType,
  options: RegistryFetchOptions = {}
): Promise<Component | null> {
  try {
    if (isUrl(name)) {
      return await fetchFromUrl(name, options)
    }

    return await getComponentByType(name, registryType, options)
  } catch (error) {
    logger.debug(`Failed to fetch ${name} from ${registryType}: ${(error as Error).message}`)
    return null
  }
}

async function fetchFromUrl(url: string, options: RegistryFetchOptions = {}): Promise<Component | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRetries = Math.max(1, options.maxRetries ?? DEFAULT_MAX_RETRIES)
  logger.debug(`Fetching component from: ${url}`)

  const data = await fetchJsonWithRetry(url, maxRetries, timeoutMs)
  return componentSchema.parse(data)
}

export async function getAllComponents(
  registryType: RegistryType = SCHEMA_CONFIG.defaultRegistryType,
  options: RegistryFetchOptions = {}
): Promise<Component[]> {
  try {
    logger.debug(`Fetching all ${registryType} components using optimized approach`)
    const indexData = await getRegistryIndex(registryType, options)
    const components: Component[] = []
    const excludeTypes = options.excludeTypes ?? []

    if (indexData.components && Array.isArray(indexData.components)) {
      for (const componentInfo of indexData.components) {
        if (excludeTypes.includes(componentInfo.type)) {
          continue
        }
        const component = await getComponent(componentInfo.name, registryType, options)
        if (component) {
          components.push(component)
        }
      }
    }
    return components
  } catch (error) {
    logger.debug(`Failed to fetch all ${registryType} components: ${(error as Error).message}`)
    return []
  }
}

function cacheStateHasIndex(registryType: RegistryType, options: RegistryFetchOptions): boolean {
  if (options.noCache) {
    return false
  }
  const cache = getRegistryCache(registryType)
  return Boolean(cache.registryIndex)
}

function getCachedInMemory(registryType: RegistryType) {
  return getRegistryCache(registryType).registryIndex
}

function setCachedInMemory(registryType: RegistryType, index: any) {
  const cache = getRegistryCache(registryType)
  cache.registryIndex = index
}

export async function getComponents(
  names: string[],
  registryType: RegistryType = SCHEMA_CONFIG.defaultRegistryType,
  options: RegistryFetchOptions = {}
): Promise<Component[]> {
  const components: Component[] = []

  for (const name of names) {
    const component = await getComponent(name, registryType, options)
    if (component) {
      components.push(component)
    }
  }

  return components
}

export function resetCache(registryType?: RegistryType): void {
  if (registryType) {
    registryCache.delete(registryType)
    logger.debug(`Cache reset for ${registryType} - will rediscover working CDN`)
  } else {
    registryCache.clear()
    logger.debug(`All registry caches reset - will rediscover working CDNs`)
  }
} 