import { createTwoFilesPatch } from "diff"

export interface FileDiffResult {
  filePath: string
  changed: boolean
  patch?: string
}

export function buildUnifiedDiff(
  oldFilePath: string,
  newFilePath: string,
  oldContent: string,
  newContent: string
): string {
  return createTwoFilesPatch(
    oldFilePath,
    newFilePath,
    oldContent,
    newContent,
    "local",
    "registry",
    { context: 3 }
  )
}

export function getLineDiff(oldContent: string, newContent: string): string {
  return buildUnifiedDiff("local", "registry", oldContent, newContent)
}

export function hasDiff(oldContent: string, newContent: string): boolean {
  return oldContent !== newContent
}

export function formatDiffPreview(diff: string, maxLines = 80): string {
  const lines = diff.split("\n")
  if (lines.length <= maxLines) {
    return diff
  }

  return `${lines.slice(0, maxLines).join("\n")}\n...`
}
