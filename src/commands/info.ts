import fs from "fs-extra"
import os from "os"
import path from "path"
import fetch from "node-fetch"
import chalk from "chalk"
import { SCHEMA_CONFIG, getCdnUrls } from "../utils/schema-config.js"
import { getRegistryCdnState } from "../registry/api.js"
import { detectPackageManager } from "../utils/package-manager.js"
import { getCliVersion } from "../utils/cli-version.js"
import { getCacheDir } from "../utils/cache.js"

interface InfoOptions {
  json?: boolean
  cdn?: boolean
}

export async function infoCommand(options: InfoOptions = {}) {
  const version = getCliVersion()
  const pm = await detectPackageManager()
  const cwd = process.cwd()

  const configStatus = await readConfigStatus()
  const cache = await readCacheStatus()
  const configOptions = configStatus.found ? {
    registryUrl: configStatus.config.registryUrl,
    registryVersion: configStatus.config.registryVersion,
    strictCdn: configStatus.config.strictCdn
  } : {}
  const cdnCandidates = getCdnUrls(SCHEMA_CONFIG.defaultRegistryType, configOptions)
  const cdn = await checkPrimaryCdn(cdnCandidates)
  const cdnState = getRegistryCdnState(SCHEMA_CONFIG.defaultRegistryType, { cdn: configOptions })

  if (options.json) {
    console.log(JSON.stringify({
      version,
      node: process.version,
      os: `${os.platform()} ${os.arch()}`,
      packageManager: pm,
      cwd,
      config: configStatus.config,
      configFound: configStatus.found,
      cache,
      cdn,
      registry: SCHEMA_CONFIG.defaultRegistry,
      cdnResolution: {
        overrides: configOptions,
        resolvedUrls: cdnState.urls,
        workingCDN: cdnState.workingCDN
      }
    }, null, 2))
    return
  }

  console.log(`ui8kit v${version}`)
  console.log(`Node    ${process.version}`)
  console.log(`OS      ${os.platform()} ${os.arch()}`)
  console.log(`PM      ${pm}`)
  console.log(`CWD     ${cwd}`)
  console.log("")
  if (configStatus.found) {
    console.log(chalk.green(`Config  ${configStatus.path} (found)`))
    const config = configStatus.config
    console.log(`  framework    ${config.framework}`)
    console.log(`  typescript   ${config.typescript}`)
    console.log(`  globalCss    ${config.globalCss}`)
    console.log(`  componentsDir ${config.componentsDir}`)
    console.log(`  libDir       ${config.libDir}`)
  } else {
    console.log(chalk.yellow("Config  not found"))
  }
  console.log("")

  console.log(`Registry  ${SCHEMA_CONFIG.defaultRegistry}`)
  console.log(`CDN       ${cdn.url} (${cdn.ok ? "ok" : "failed"})`)
  console.log(`Cache     ${cache.path} (${cache.items} items, ${cache.mb} MB)`)

  if (options.cdn) {
    console.log("")
    console.log("CDN Resolution")
    console.log(`  workingCDN: ${cdnState.workingCDN || "not resolved yet in cache"}`
    )
    console.log(`  registryUrl override: ${configOptions.registryUrl || "not set"}`)
    console.log(`  registryVersion: ${configOptions.registryVersion || "not set"}`)
    console.log(`  strictCdn: ${configOptions.strictCdn ? "enabled" : "disabled"}`)
    console.log("  resolved order:")
    cdnState.urls.forEach((item, index) => {
      console.log(`    ${index + 1}. ${item}`)
    })
  }
}

async function readConfigStatus():
  Promise<{ found: boolean; path: string | null; config: any }>{
  const candidatePaths = [
    path.join(process.cwd(), "ui8kit.config.json"),
    path.join(process.cwd(), "src", "ui8kit.config.json"),
    path.join(process.cwd(), SCHEMA_CONFIG.defaultRegistryType, "ui8kit.config.json"),
  ]

  for (const configPath of candidatePaths) {
    if (await fs.pathExists(configPath)) {
      try {
        const config = await fs.readJson(configPath)
        return {
          found: true,
          path: `./${path.relative(process.cwd(), configPath).replace(/\\/g, "/")}`,
          config: {
            framework: config.framework ?? "unknown",
            typescript: config.typescript ?? false,
            globalCss: config.globalCss ?? "src/index.css",
            componentsDir: config.componentsDir ?? SCHEMA_CONFIG.defaultDirectories.components,
            libDir: config.libDir ?? SCHEMA_CONFIG.defaultDirectories.lib,
            registryUrl: config.registryUrl,
            registryVersion: config.registryVersion,
            strictCdn: config.strictCdn
          }
        }
      } catch {
        continue
      }
    }
  }

  return {
    found: false,
    path: null,
    config: null
  }
}

async function readCacheStatus(): Promise<{ path: string; items: number; mb: string }> {
  const cachePath = getCacheDir()
  let items = 0
  let bytes = 0
  if (await fs.pathExists(cachePath)) {
    const result = await countCacheFiles(cachePath)
    items = result.count
    bytes = result.bytes
  }
  return {
    path: cachePath.replace(/\\/g, "/"),
    items,
    mb: `${(bytes / (1024 * 1024)).toFixed(1)}`
  }
}

async function countCacheFiles(dirPath: string): Promise<{ count: number; bytes: number }> {
  let count = 0
  let size = 0
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const nested = await countCacheFiles(fullPath)
      count += nested.count
      size += nested.bytes
      continue
    }

    count += 1
    const stat = await fs.stat(fullPath)
    size += stat.size
  }
  return { count, bytes: size }
}

async function checkPrimaryCdn(urls: string[] = SCHEMA_CONFIG.cdnBaseUrls): Promise<{ url: string; ok: boolean }> {
  const url = urls[0]
  if (!url) {
    return { url: "not configured", ok: false }
  }
  try {
    const response = await fetch(`${url}/index.json`, { method: "HEAD" })
    if (response.status >= 200 && response.status < 400) {
      return { url, ok: true }
    }
  } catch {
    // Intentionally ignore.
  }
  return { url, ok: false }
}
