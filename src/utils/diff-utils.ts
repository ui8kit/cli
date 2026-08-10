export interface FileDiffResult {
  filePath: string
  changed: boolean
  patch?: string
}

function splitLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n")
  if (normalized === "") return []
  const lines = normalized.split("\n")
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop()
  }
  return lines
}

/** Minimal unified diff (no external `diff` package). */
export function buildUnifiedDiff(
  oldFilePath: string,
  newFilePath: string,
  oldContent: string,
  newContent: string,
): string {
  const oldLines = splitLines(oldContent)
  const newLines = splitLines(newContent)

  const header = [
    `--- ${oldFilePath}\tlocal`,
    `+++ ${newFilePath}\tregistry`,
    `@@ -1,${Math.max(oldLines.length, 1)} +1,${Math.max(newLines.length, 1)} @@`,
  ]

  const body: string[] = []
  const max = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < max; i++) {
    const a = oldLines[i]
    const b = newLines[i]
    if (a === b) {
      if (a !== undefined) body.push(` ${a}`)
      continue
    }
    if (a !== undefined) body.push(`-${a}`)
    if (b !== undefined) body.push(`+${b}`)
  }

  return `${[...header, ...body].join("\n")}\n`
}

export function getLineDiff(oldContent: string, newContent: string): string {
  return buildUnifiedDiff("local", "registry", oldContent, newContent)
}

export function hasDiff(oldContent: string, newContent: string): boolean {
  return oldContent !== newContent
}

export function formatDiffPreview(diff: string, maxLines = 80): string {
  const lines = diff.split("\n")
  if (lines.length <= maxLines) return diff
  return `${lines.slice(0, maxLines).join("\n")}\n...`
}
