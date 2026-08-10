let verboseEnabled = false

export type LoggerLevel = "info" | "success" | "warn" | "error" | "debug"

function prefix(level: LoggerLevel): string {
  switch (level) {
    case "info":
      return "i"
    case "success":
      return "√"
    case "warn":
      return "!"
    case "error":
      return "x"
    case "debug":
      return "."
    default:
      return "-"
  }
}

function output(level: LoggerLevel, message: string, ...args: unknown[]) {
  if (level === "debug" && !verboseEnabled) return
  console.log(`${prefix(level)} ${message}`, ...args)
}

/** Minimal spinner stand-in (no ora). */
export class Spinner {
  text: string

  constructor(text: string) {
    this.text = text
  }

  start(): this {
    console.log(`- ${this.text}`)
    return this
  }

  succeed(message?: string): this {
    console.log(`√ ${message ?? this.text}`)
    return this
  }

  fail(message?: string): this {
    console.log(`x ${message ?? this.text}`)
    return this
  }

  info(message?: string): this {
    console.log(`i ${message ?? this.text}`)
    return this
  }
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
    return new Spinner(text).start()
  },
}

export function isVerboseMode(): boolean {
  return verboseEnabled
}
