#!/usr/bin/env node

/**
 * CDN diagnostics for ui8kit registry bases (3.x per-runtime layout: r/<runtime>/…).
 * Reads cdnBaseUrls from schema-config (or --config) and probes sample paths.
 *
 *   node scripts/get-cdn.js
 *   node scripts/get-cdn.js --url https://cdn.example.com/r --path index.json --json
 */

import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

/** Runtimes published per-runtime in @ui8kit/registry 3.x (`r/<runtime>/…`) */
export const RUNTIMES = ["react", "vue", "svelte", "solid", "webcomponent"]

/** Default probe paths under `r/<runtime>/` */
const RUNTIME_SUFFIXES = ["index.json", "utils/utils.json", "rules/rules.json", "components/ui/button.json"]

/** `@latest` placeholder in cdnBaseUrls is rewritten to this (mirrors CLI: registry major = CLI major) */
export const DEFAULT_REGISTRY_VERSION = "3"

export function defaultSuffixes(runtimes = RUNTIMES) {
  return runtimes.flatMap((rt) => RUNTIME_SUFFIXES.map((s) => `${rt}/${s}`))
}

export function pinVersion(url, version = DEFAULT_REGISTRY_VERSION) {
  return url.replace("@latest", `@${version}`)
}

export function parseArgs(argv) {
  const configFiles = []
  const suffixes = []
  const runtimes = []
  let version = DEFAULT_REGISTRY_VERSION
  let jsonOutput = false
  const extraUrls = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--json") {
      jsonOutput = true
      continue
    }
    if ((arg === "--config" || arg === "-c") && argv[i + 1]) {
      configFiles.push(argv[i + 1])
      i += 1
      continue
    }
    if ((arg === "--url" || arg === "-u") && argv[i + 1]) {
      extraUrls.push(normalizeBaseUrl(argv[i + 1]))
      i += 1
      continue
    }
    if ((arg === "--runtime" || arg === "-r") && argv[i + 1]) {
      runtimes.push(argv[i + 1].trim())
      i += 1
      continue
    }
    if (arg === "--registry-version" && argv[i + 1]) {
      version = argv[i + 1].trim()
      i += 1
      continue
    }
    if ((arg === "--path" || arg === "-p") && argv[i + 1]) {
      suffixes.push(normalizeRelativePath(argv[i + 1]))
      i += 1
      continue
    }
    if (!arg.startsWith("-")) {
      configFiles.push(arg)
    }
  }

  if (!configFiles.length) {
    configFiles.push("src/utils/schema-config.ts")
  }

  return {
    configFiles,
    suffixes: [...new Set([...defaultSuffixes(runtimes.length ? runtimes : RUNTIMES), ...suffixes])],
    version,
    extraUrls,
    jsonOutput,
  }
}

export function extractCdnBaseUrls(fileContent) {
  const match = fileContent.match(/cdnBaseUrls\s*:\s*\[([\s\S]*?)\](?:\s*as\b)?/m)
  if (!match) {
    return []
  }
  return Array.from(match[1].matchAll(/["'`]\s*([^"'`]+?)\s*["'`]/g))
    .map((m) => m[1])
    .filter(Boolean)
}

export function normalizeBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/+$/, "")
}

export function normalizeRelativePath(value) {
  return value.trim().replace(/^\/+/, "").replace(/^r\/+/, "")
}

export function buildTargetUrls(cdnBaseUrls, suffixes) {
  const targets = []
  for (const base of cdnBaseUrls) {
    const baseUrl = normalizeBaseUrl(base).replace(/\/r\/?$/, "")
    for (const suffix of suffixes) {
      const normalizedSuffix = normalizeRelativePath(suffix)
      if (!normalizedSuffix) continue
      targets.push({
        baseUrl,
        suffix: normalizedSuffix,
        target: `${baseUrl}/r/${normalizedSuffix}`,
      })
    }
  }
  return targets
}

export async function readUrlsFromFiles(configFiles) {
  const baseUrls = new Set()
  for (const file of configFiles) {
    const resolvedPath = path.resolve(process.cwd(), file)
    try {
      const content = await readFile(resolvedPath, "utf-8")
      for (const url of extractCdnBaseUrls(content)) {
        if (url.startsWith("http://") || url.startsWith("https://")) {
          baseUrls.add(normalizeBaseUrl(url))
        }
      }
    } catch (error) {
      console.error(`[warn] Cannot read ${resolvedPath}: ${error.message}`)
    }
  }
  return [...baseUrls]
}

async function fetchAndReport(url) {
  try {
    const response = await fetch(url)
    const ok = response.ok
    const snippet = ok ? (await response.text()).slice(0, 120) : null
    const length = response.headers.get("content-length")
    return {
      url,
      status: response.status,
      ok,
      contentLength: length ? Number.parseInt(length, 10) : null,
      etag: response.headers.get("etag") || null,
      lastModified: response.headers.get("last-modified") || null,
      preview: snippet ? snippet.replace(/\s+/g, " ").trim() : null,
    }
  } catch (error) {
    return { url, status: 0, ok: false, error: error.message }
  }
}

function usage() {
  console.log(`Usage:
  node scripts/get-cdn.js [--config path] [--runtime rt] [--registry-version v] [--path path] [--json] [--url baseUrl]

Options:
  --config, -c   File with cdnBaseUrls (default: src/utils/schema-config.ts)
  --runtime, -r  Probe only this runtime (repeatable; default: ${RUNTIMES.join(", ")})
  --registry-version  Replaces @latest in config bases (default: ${DEFAULT_REGISTRY_VERSION})
  --path, -p     Extra path under /r/ to probe (e.g. react/components/ui/text.json)
  --url, -u      Extra registry base URL (…/r or host root)
  --json         Raw JSON output
`)
}

async function main() {
  const { configFiles, suffixes, jsonOutput, extraUrls, version } = parseArgs(process.argv.slice(2))

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage()
    return
  }

  const bases = await readUrlsFromFiles(configFiles)
  const allBases = [
    ...new Set([
      ...bases.map((b) => pinVersion(b, version)),
      ...extraUrls.filter((url) => url.startsWith("http://") || url.startsWith("https://")),
    ]),
  ]

  if (!allBases.length) {
    console.error("No valid CDN base URLs found (config or --url).")
    process.exit(1)
  }

  const targets = buildTargetUrls(allBases, suffixes).map((entry) => entry.target)
  const results = []
  for (const target of targets) {
    results.push(await fetchAndReport(target))
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ targets: results }, null, 2))
    return
  }

  for (const result of results) {
    if (result.ok) {
      console.log(`[ok] ${result.status} ${result.url}`)
      if (result.contentLength !== null) {
        console.log(
          `     size=${result.contentLength}, etag=${result.etag || "n/a"}, last-modified=${result.lastModified || "n/a"}`,
        )
      }
      if (result.preview) console.log(`     preview=${result.preview}`)
    } else if (result.error) {
      console.log(`[fail] ${result.url} (${result.error})`)
    } else {
      console.log(`[fail] ${result.url} (${result.status})`)
    }
  }
}

const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
