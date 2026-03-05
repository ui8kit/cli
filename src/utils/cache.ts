import fs from "fs-extra"
import os from "os"
import path from "path"

const DEFAULT_TTL_MS = 3_600_000

export interface CacheOptions {
  ttlMs?: number
  noCache?: boolean
}

function normalizeKey(key: string): string {
  return key
    .trim()
    .replace(/^\/+/, "")
    .replace(/\\/g, "/")
}

function cacheFilePath(key: string): { dataPath: string; metaPath: string } {
  const cacheDir = getCacheDir()
  const normalized = normalizeKey(key)
  const normalizedWithJson = normalized.endsWith(".json") ? normalized : `${normalized}.json`
  const dataPath = path.join(cacheDir, normalizedWithJson)
  return { dataPath, metaPath: `${dataPath}.meta.json` }
}

export function getCacheDir(): string {
  return path.join(os.homedir(), ".ui8kit", "cache")
}

function parseTimestamp(timestamp: unknown): number | null {
  if (typeof timestamp !== "number") {
    return null
  }
  return Number.isFinite(timestamp) ? timestamp : null
}

export async function getCachedJson(key: string, options: CacheOptions = {}): Promise<any | null> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  if (options.noCache) {
    return null
  }

  const { dataPath, metaPath } = cacheFilePath(key)
  if (!(await fs.pathExists(dataPath)) || !(await fs.pathExists(metaPath))) {
    return null
  }

  try {
    const meta = await fs.readJson(metaPath) as { lastFetched?: unknown; ttl?: unknown }
    const lastFetched = parseTimestamp(meta?.lastFetched)
    const metaTtl = parseTimestamp(meta?.ttl) ?? ttlMs

    if (!lastFetched) {
      return null
    }

    const now = Date.now()
    if (now - lastFetched > metaTtl) {
      return null
    }

    return await fs.readJson(dataPath)
  } catch {
    return null
  }
}

export async function setCachedJson(key: string, data: unknown, options: CacheOptions = {}): Promise<void> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const { dataPath, metaPath } = cacheFilePath(key)
  await fs.ensureDir(path.dirname(dataPath))

  await fs.writeJson(dataPath, data, { spaces: 2 })
  await fs.writeJson(metaPath, {
    lastFetched: Date.now(),
    ttl: ttlMs
  })
}

export async function clearCache(): Promise<void> {
  const cacheDir = getCacheDir()
  if (await fs.pathExists(cacheDir)) {
    await fs.remove(cacheDir)
  }
}

