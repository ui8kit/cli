import chalk from "chalk"
import ora from "ora"

let verboseEnabled = false

export type LoggerLevel = "info" | "success" | "warn" | "error" | "debug"

function output(level: LoggerLevel, message: string, ...args: unknown[]) {
  const prefix = (() => {
    switch (level) {
      case "info":
        return chalk.blue("ℹ")
      case "success":
        return chalk.green("✅")
      case "warn":
        return chalk.yellow("⚠️")
      case "error":
        return chalk.red("❌")
      case "debug":
        return chalk.gray("🐞")
      default:
        return ""
    }
  })()

  if (level === "debug" && !verboseEnabled) {
    return
  }

  // Keep output stable across all commands.
  console.log(`${prefix} ${message}`, ...args)
}

export const logger = {
  setVerbose(enabled: boolean) {
    verboseEnabled = enabled
  },
  info(message: string, ...args: unknown[]) {
    output("info", message, ...args)
  },
  success(message: string, ...args: unknown[]) {
    output("success", message, ...args)
  },
  warn(message: string, ...args: unknown[]) {
    output("warn", message, ...args)
  },
  error(message: string, ...args: unknown[]) {
    output("error", message, ...args)
  },
  debug(message: string, ...args: unknown[]) {
    output("debug", message, ...args)
  },
  spinner(text: string) {
    return ora(text).start()
  }
}

export function isVerboseMode(): boolean {
  return verboseEnabled
}
