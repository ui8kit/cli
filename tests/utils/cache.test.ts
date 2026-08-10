import {
  ensureDir,
  pathExists,
  readJson,
  writeJson,
  remove,
  readFile,
  writeFile,
} from "../../src/utils/fs.js"
import os from "os"
import path from "path"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { getCachedJson, setCachedJson, clearCache, getCacheDir } from "../../src/utils/cache.js"

const TMP_PREFIX = "ui8kit-cache-test"

function getRandomTempDir(): string {
  return path.join(os.tmpdir(), `${TMP_PREFIX}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`)
}

function getMetaPath(key: string): string {
  const cacheDir = getCacheDir()
  const normalized = key.trim().replace(/^\/+/, "").replace(/\\/g, "/")
  const dataFile = `${normalized.endsWith(".json") ? normalized : `${normalized}.json`}`
  return `${path.join(cacheDir, dataFile)}.meta.json`
}

describe("cache utilities", () => {
  beforeEach(() => {
    const tempDir = getRandomTempDir()
    vi.spyOn(os, "homedir").mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await clearCache()
    vi.restoreAllMocks()
  })

  it("returns null for missing cache key", async () => {
    const result = await getCachedJson("missing-key")
    expect(result).toBeNull()
  })

  it("returns null for expired TTL", async () => {
    await setCachedJson("expired", { value: "old" }, { ttlMs: 1_000 })
    const metaPath = getMetaPath("expired")
    await writeJson(metaPath, {
      lastFetched: Date.now() - 2_000,
      ttl: 1_000
    })

    const result = await getCachedJson("expired")
    expect(result).toBeNull()
  })

  it("returns cached data while TTL is valid", async () => {
    const payload = { value: "fresh" }
    await setCachedJson("fresh", payload, { ttlMs: 5_000 })

    const result = await getCachedJson("fresh")
    expect(result).toEqual(payload)
  })

  it("writes cache data and metadata", async () => {
    const payload = { value: "stored" }
    await setCachedJson("stored", payload)

    const cachePath = getCacheDir()
    const dataPath = path.join(cachePath, "stored.json")
    const metaPath = `${dataPath}.meta.json`

    expect(await pathExists(dataPath)).toBe(true)
    expect(await pathExists(metaPath)).toBe(true)
    expect(await readJson(dataPath)).toEqual(payload)
  })

  it("clears cache directory", async () => {
    await setCachedJson("toClear", { value: "x" })
    expect(await pathExists(getCacheDir())).toBe(true)

    await clearCache()
    expect(await pathExists(getCacheDir())).toBe(false)
  })

  it("bypasses cache when noCache is true", async () => {
    await setCachedJson("bypass", { value: "y" })
    const direct = await getCachedJson("bypass")
    expect(direct).toEqual({ value: "y" })

    const bypass = await getCachedJson("bypass", { noCache: true })
    expect(bypass).toBeNull()
  })
})
