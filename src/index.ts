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
import { listCommand } from "./commands/list.js"
import { diffCommand } from "./commands/diff.js"
import { cacheClearCommand } from "./commands/cache.js"
import { logger } from "./utils/logger.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(__dirname, "../package.json")

function getCliVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string }
    return pkg.version ?? "0.0.0"
  } catch {
    return "0.0.0"
  }
}

const program = new Command()

program
  .option("-c, --cwd <dir>", "Working directory", process.cwd())
  .option("-v, --verbose", "Enable verbose output")
  .option("--no-cache", "Bypass registry cache")
  .name("ui8kit")
  .description("A CLI for adding UI components to your Vite React projects (UI8Kit registry)")
  .version(getCliVersion())

program
  .command("list")
  .description("List available components in registry")
  .option("-r, --registry <type>", "Registry type: ui", "ui")
  .option("--json", "Output raw JSON")
  .action((options) => listCommand(options))

program
  .command("diff")
  .description("Show local vs registry differences")
  .argument("[component]", "Component name")
  .option("-r, --registry <type>", "Registry type: ui", "ui")
  .option("--json", "Output diff in machine-readable JSON")
  .action((component, options) => diffCommand(component, options))

program
  .command("cache")
  .description("Manage local cache")
  .command("clear")
  .description("Clear registry cache")
  .action(cacheClearCommand)

program
  .command("init")
  .description("Initialize UI8Kit structure in your project")
  .option("-y, --yes", "Skip prompts and use defaults")
  .option("-r, --registry <type>", "Registry type: ui", "ui")
  .action(initCommand)

program
  .command("add")
  .description("Add components to your project from the registry")
  .argument("[components...]", "Components to add")
  .option("-a, --all", "Install all available components")
  .option("-f, --force", "Overwrite existing files")
  .option("-r, --registry <type>", "Registry type: ui", "ui")
  .option("--dry-run", "Show what would be installed without installing")
  .option("--retry", "Aggressive retry mode (3 attempts per CDN request)")
  .action(addCommand)

program
  .command("scan")
  .description("Scan and generate registry from existing components")
  .option("-r, --registry <type|path>", "Registry type (ui) or custom path", "ui")
  .option("-o, --output <file>", "Output registry file")
  .option("-s, --source <dir>", "Source directory to scan")
  .action(async (options) => {
    await scanCommand(options)
  })

program
  .command("build")
  .description("Build components registry")
  .argument("[registry]", "Path to registry.json file", "./src/registry.json")
  .option("-o, --output <path>", "Output directory", "./packages/registry/r")
  .action(buildCommand)

program.on("command:*", () => {
  console.error(chalk.red(`Invalid command: ${program.args.join(" ")}`))
  console.log("See --help for a list of available commands.")
  process.exit(1)
})

program.hook("preAction", (_, actionCommand) => {
  const actionOptions = actionCommand?.opts?.() as {
    verbose?: boolean
    cwd?: string
  } | undefined
  const globalOptions = program.opts() as {
    verbose?: boolean
    cwd?: string
  }

  const verbose = globalOptions.verbose || actionOptions?.verbose
  const cwd = actionOptions?.cwd || globalOptions.cwd

  if (verbose) {
    logger.setVerbose(true)
  }

  if (cwd && resolve(process.cwd()) !== resolve(cwd)) {
    process.chdir(cwd)
  }
})

program.parse()