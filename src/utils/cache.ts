import os from "os"
import path from "path"
import { ensureDir, pathExists, readJson, remove, writeJson } from "./fs.js"

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
  if (!(await pathExists(dataPath)) || !(await pathExists(metaPath))) {
    return null
  }

  try {
    const meta = await readJson<{ lastFetched?: unknown; ttl?: unknown }>(metaPath)
    const lastFetched = parseTimestamp(meta?.lastFetched)
    const metaTtl = parseTimestamp(meta?.ttl) ?? ttlMs

    if (!lastFetched) {
      return null
    }

    const now = Date.now()
    if (now - lastFetched > metaTtl) {
      return null
    }

    return await readJson(dataPath)
  } catch {
    return null
  }
}

export async function setCachedJson(key: string, data: unknown, options: CacheOptions = {}): Promise<void> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const { dataPath, metaPath } = cacheFilePath(key)
  await ensureDir(path.dirname(dataPath))

  await writeJson(dataPath, data, { spaces: 2 })
  await writeJson(metaPath, {
    lastFetched: Date.now(),
    ttl: ttlMs
  })
}

export async function clearCache(): Promise<void> {
  const cacheDir = getCacheDir()
  if (await pathExists(cacheDir)) {
    await remove(cacheDir)
  }
}
