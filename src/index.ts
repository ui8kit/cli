import { Command } from "commander"
import { addCommand } from "./commands/add.js"
import { initCommand } from "./commands/init.js"
import { buildCommand } from "./commands/build.js"
import { scanCommand } from "./commands/scan.js"
import { listCommand } from "./commands/list.js"
import { diffCommand } from "./commands/diff.js"
import { cacheClearCommand } from "./commands/cache.js"
import { infoCommand } from "./commands/info.js"
import { registryCleanCommand } from "./commands/registry.js"
import { resetCommand } from "./commands/reset.js"
import { logger } from "./utils/logger.js"
import { getCliVersion } from "./utils/cli-version.js"
import { resolve } from "node:path"

const program = new Command()

program
  .option("-c, --cwd <dir>", "Working directory", process.cwd())
  .option("-v, --verbose", "Enable verbose output")
  .option("--no-cache", "Bypass registry cache")
  .name("ui8kit")
  .description(
    "Universal CLI: install UI8Kit primitives/blocks into your app (shadcn-style, multi-runtime)",
  )
  .version(getCliVersion())

program
  .command("list")
  .description("List available components in registry")
  .option("-r, --registry <type>", "Registry type", "ui")
  .option("--json", "Output raw JSON")
  .option("--registry-url <url>", "Override registry base URL")
  .option("--registry-version <version>", "Pin @latest → @version in CDN URLs")
  .option("--strict-cdn", "Do not fall back when --registry-url is set")
  .action((options) => listCommand(options))

program
  .command("diff")
  .description("Show local vs registry differences")
  .argument("[component]", "Component name")
  .option("-r, --registry <type>", "Registry type", "ui")
  .option("--json", "Output diff as JSON")
  .option("--registry-url <url>", "Override registry base URL")
  .option("--registry-version <version>", "Pin registry version")
  .option("--strict-cdn", "Do not fall back when --registry-url is set")
  .action((component, options) => diffCommand(component, options))

program
  .command("cache")
  .description("Manage local cache")
  .command("clear")
  .description("Clear registry cache")
  .action(cacheClearCommand)

program
  .command("registry")
  .description("Manage generated registry artifacts")
  .command("clean")
  .description("Remove generated registry build artifacts")
  .option("--dry-run", "Show what would be removed")
  .option("--all", "Also remove src/registry.json")
  .option("-f, --force", "Skip confirmation")
  .action(registryCleanCommand)

program
  .command("reset")
  .description("Reset local UI8Kit state")
  .option("--dry-run", "Show what would be removed")
  .option("--with-cache", "Also clear CLI cache")
  .option("-y, --yes", "Skip prompts")
  .option("-f, --force", "Skip confirmation")
  .action(resetCommand)

program
  .command("info")
  .description("Show environment and config diagnostics")
  .option("--json", "Output as JSON")
  .option("--cdn", "Show CDN order and overrides")
  .action(infoCommand)

program
  .command("init")
  .description("Initialize universal kit folders + ui8kit.config.json")
  .option("-y, --yes", "Skip prompts and use defaults")
  .option("-r, --registry <type>", "Registry type", "ui")
  .option("--framework <name>", "react|svelte|vue|solid|templ|latte|twig|jinja2|none")
  .option("--runtime <name>", "Default registry runtime slice")
  .option("--dir <path>", "Install root (src, web/src, internal, …)")
  .option("--skip-core", "Do not fetch utils/lib from registry on init")
  .option("--registry-url <url>", "Override registry base URL")
  .option("--registry-version <version>", "Pin registry version")
  .option("--strict-cdn", "Do not fall back when --registry-url is set")
  .option("--import-style <alias|package>", "TS/TSX import rewrite style", "alias")
  .action(initCommand)

program
  .command("add")
  .description("Add components from the registry into app folders")
  .argument("[components...]", "Components to add")
  .option("-a, --all", "Install all available components")
  .option("-f, --force", "Overwrite existing files")
  .option("-r, --registry <type>", "Registry type", "ui")
  .option(
    "--runtime <name>",
    "Install only this runtime's files (+ shared); skip items with a different runtime field",
  )
  .option(
    "--path <key=dir>",
    "Override an install folder for this run (e.g. ui=kit); beats config.paths and registry targets. Repeatable",
    (value: string, previous: string[] = []) => [...previous, value],
  )
  .option("--dry-run", "Plan without writing")
  .option("--retry", "Retry CDN requests")
  .option("--registry-url <url>", "Override registry base URL")
  .option("--registry-version <version>", "Pin registry version")
  .option("--strict-cdn", "Do not fall back when --registry-url is set")
  .action(addCommand)

program
  .command("scan")
  .description("Scan and generate registry from existing components")
  .option("-r, --registry <type|path>", "Registry type or path", "ui")
  .option("-o, --output <file>", "Output registry file")
  .option("-s, --source <dir>", "Source directory to scan")
  .action(async (options) => {
    await scanCommand(options)
  })

program
  .command("build")
  .description("Build publishable registry from registry.json")
  .argument("[registry]", "Path to registry.json", "./src/registry.json")
  .option("-o, --output <path>", "Output directory", "./packages/registry/r")
  .action(buildCommand)

program.on("command:*", () => {
  console.error(`Invalid command: ${program.args.join(" ")}`)
  console.log("See --help for a list of available commands.")
  process.exit(1)
})

program.hook("preAction", (_, actionCommand) => {
  const actionOptions = actionCommand?.opts?.() as { verbose?: boolean; cwd?: string } | undefined
  const globalOptions = program.opts() as { verbose?: boolean; cwd?: string }

  if (globalOptions.verbose || actionOptions?.verbose) {
    logger.setVerbose(true)
  }

  const cwd = actionOptions?.cwd || globalOptions.cwd
  if (cwd && resolve(process.cwd()) !== resolve(cwd)) {
    process.chdir(cwd)
  }
})

program.parse()
