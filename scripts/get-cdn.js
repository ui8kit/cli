#!/usr/bin/env node

import { readFile } from "node:fs/promises"
import path from "node:path"

const SUFFIXES = [
  "components/variants/index.json",
  "components/ui/Button.json",
]

function parseArgs(argv) {
  const configFiles = []
  const suffixes = [...SUFFIXES]
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
    suffixes: [...new Set(suffixes)],
    extraUrls,
    jsonOutput
  }
}

function extractCdnBaseUrls(fileContent) {
  const match = fileContent.match(/cdnBaseUrls\s*:\s*\[([\s\S]*?)\]/m)
  if (!match) {
    return []
  }
  return Array.from(match[1].matchAll(/["'`]\s*([^"'`]+?)\s*["'`]/g)).map((m) => m[1]).filter(Boolean)
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/+$/, "")
}

function normalizeRelativePath(value) {
  return value
    .trim()
    .replace(/^\/+/, "")
    .replace(/^r\/+/, "")
}

async function readUrlsFromFiles(configFiles) {
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
  node scripts/get-cdn.js [--config path] [--path path] [--json] [--url baseUrl]

Options:
  --config, -c   Path to file containing cdnBaseUrls (default: src/utils/schema-config.ts)
  --path, -p     Additional path appended to CDN base URLs
  --url, -u      Prepend additional base URL
  --json         Output raw JSON
`)
}

async function main() {
  const { configFiles, suffixes, jsonOutput, extraUrls } = parseArgs(process.argv.slice(2))

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage()
    return
  }

  const bases = await readUrlsFromFiles(configFiles)
  if (!bases.length) {
    console.error("No valid cdnBaseUrls found.")
    process.exit(1)
  }

  const allBases = [...new Set([...bases, ...extraUrls.filter((url) => url.startsWith("http://") || url.startsWith("https://"))])]
  const targets = []
  for (const base of allBases) {
    for (const suffix of suffixes) {
      const baseUrl = normalizeBaseUrl(base).replace(/\/r\/?$/, "")
      const normalizedSuffix = normalizeRelativePath(suffix)
      if (!normalizedSuffix) {
        continue
      }
      targets.push(`${baseUrl}/r/${normalizedSuffix}`)
    }
  }

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
        console.log(`     size=${result.contentLength}, etag=${result.etag || "n/a"}, last-modified=${result.lastModified || "n/a"}`)
      }
      if (result.preview) {
        console.log(`     preview=${result.preview}`)
      }
    } else if (result.error) {
      console.log(`[fail] ${result.url} (${result.error})`)
    } else {
      console.log(`[fail] ${result.url} (${result.status})`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
