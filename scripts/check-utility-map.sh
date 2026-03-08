#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE_DIR="${ROOT_DIR}/.workflow/ui8kit-core"
REGISTRY_DIR="${ROOT_DIR}/.workflow/registry"
REGISTRY_FILE="${REGISTRY_DIR}/ui8kit.map.json"

log_step() {
  echo "==> $1"
}

log_step "Building registry artifacts to refresh utility map"
node dist/index.js --cwd "${CORE_DIR}" build src/registry.json --output ../registry/r

log_step "Validating ui8kit map shape and sample classes"

node - "${REGISTRY_FILE}" <<'NODE'
const fs = require("fs");
const path = process.argv[2];

if (!fs.existsSync(path)) {
  console.error(`Map file not found: ${path}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(path, "utf-8"));

if (!payload || typeof payload !== "object") {
  console.error("Invalid map file content: expected JSON object");
  process.exit(1);
}

if (!Array.isArray(payload.map)) {
  console.error("Invalid map format: expected payload.map to be an array");
  process.exit(1);
}

const mapValues = new Set(payload.map);
const required = ["bg-accent", "bg-accent-foreground", "bg-background"];
const missing = required.filter((item) => !mapValues.has(item));

if (missing.length > 0) {
  console.error(`Missing expected classes: ${missing.join(", ")}`);
  process.exit(1);
}

if (payload.map.length === 0) {
  console.error("Invalid map: payload.map is empty");
  process.exit(1);
}

console.log("Map validation passed.");
console.log(`Version: ${payload.version}`);
console.log(`Generated at: ${payload.generatedAt}`);
console.log(`Total utility classes: ${payload.map.length}`);
NODE
