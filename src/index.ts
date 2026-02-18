#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Command } from "commander"
import chalk from "chalk"
import { addCommand } from "./commands/add.js"
import { initCommand } from "./commands/init.js"
import { buildCommand } from "./commands/build.js"
import { scanCommand } from "./commands/scan.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf-8")
) as { version: string }

const program = new Command()

program
  .name("ui8kit")
  .description("UI8Kit CLI for component registry and build (init, add, scan, build)")
  .version(pkg.version)
  .showHelpAfterError("(add --help for additional details)")
  .addHelpText(
    "after",
    `
Examples:
  bunx ui8kit@latest init --yes
  bunx ui8kit@latest add button card
  bunx ui8kit@latest scan --cwd ./src/components
  bunx ui8kit@latest build ./src/registry.json --output ./packages/registry/r

Pipelines:
  Registry maintainer: scan -> build
  Brand app: init -> add
`
  )

const initCmd = program
  .command("init")
  .description("Initialize UI8Kit structure in your project")
  .option("-y, --yes", "Skip prompts and use defaults")
  .option("-r, --registry <type>", "Registry type: ui", "ui")
  .action(initCommand)
initCmd.addHelpText(
  "after",
  `
Examples:
  bunx ui8kit@latest init
  bunx ui8kit@latest init --yes
  bunx ui8kit@latest init --registry ui
`
)

const addCmd = program
  .command("add")
  .description("Add components to your project from the registry")
  .argument("[components...]", "Components to add")
  .option("-a, --all", "Install all available components")
  .option("-f, --force", "Overwrite existing files")
  .option("-r, --registry <type>", "Registry type: ui", "ui")
  .option("--dry-run", "Show what would be installed without installing")
  .option("--retry", "Enable retry logic for unreliable connections")
  .action(addCommand)
addCmd.addHelpText(
  "after",
  `
Examples:
  bunx ui8kit@latest add button
  bunx ui8kit@latest add button card
  bunx ui8kit@latest add --all
  bunx ui8kit@latest add badge --force
  bunx ui8kit@latest add --all --retry
`
)

const scanCmd = program
  .command("scan")
  .description("Scan and generate registry from existing components")
  .option("-r, --registry <type|path>", "Registry type (ui) or custom path", "ui")
  .option("-o, --output <file>", "Output registry file")
  .option("-s, --source <dir>", "Source directory to scan")
  .option("--cwd <dir>", "Working directory")
  .action(async (options) => {
    await scanCommand(options)
  })
scanCmd.addHelpText(
  "after",
  `
Examples:
  bunx ui8kit@latest scan
  bunx ui8kit@latest scan --cwd ./src/components
  bunx ui8kit@latest scan --source ./src --output ./src/registry.json
`
)

const buildCmd = program
  .command("build")
  .description("Build components registry")
  .argument("[registry]", "Path to registry.json file", "./src/registry.json")
  .option("-o, --output <path>", "Output directory", "./packages/registry/r")
  .option("-c, --cwd <cwd>", "Working directory", process.cwd())
  .action(buildCommand)
buildCmd.addHelpText(
  "after",
  `
Examples:
  bunx ui8kit@latest build
  bunx ui8kit@latest build ./src/registry.json
  bunx ui8kit@latest build ./src/registry.json --output ./packages/registry/r
`
)

program.on("command:*", () => {
  console.error(chalk.red(`Invalid command: ${program.args.join(" ")}`))
  console.log("See --help for a list of available commands.")
  process.exit(1)
})

program.parse() 