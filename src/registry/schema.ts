import { z } from "zod"
import {
  CANONICAL_PATHS,
  COMPONENT_TYPES,
  FRAMEWORKS,
  RUNTIMES,
  SCHEMA_CONFIG,
} from "../utils/schema-config.js"

export const componentFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  /**
   * Install path relative to config.dir.
   * Example: "components/ui/button/Button.svelte"
   */
  target: z.string().optional(),
})

export const componentSchema = z.object({
  name: z.string(),
  type: z.enum(COMPONENT_TYPES as unknown as readonly [string, ...string[]]),
  title: z.string().optional(),
  description: z.string().optional(),
  runtime: z.enum(RUNTIMES as unknown as readonly [string, ...string[]]).optional(),
  digest: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  devDependencies: z.array(z.string()).default([]),
  registryDependencies: z.array(z.string()).optional(),
  files: z.array(componentFileSchema),
  tailwind: z
    .object({
      config: z
        .object({
          content: z.array(z.string()).optional(),
          theme: z.record(z.string(), z.any()).optional(),
          plugins: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  cssVars: z
    .object({
      theme: z.record(z.string(), z.string()).optional(),
      light: z.record(z.string(), z.string()).optional(),
      dark: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  meta: z.record(z.string(), z.any()).optional(),
})

export type ComponentFile = z.infer<typeof componentFileSchema>
export type Component = z.infer<typeof componentSchema>

const pathsSchema = z
  .object({
    lib: z.string().optional(),
    utils: z.string().optional(),
    components: z.string().optional(),
    ui: z.string().optional(),
    blocks: z.string().optional(),
    layouts: z.string().optional(),
    variants: z.string().optional(),
    widgets: z.string().optional(),
  })
  .optional()

export const configSchema = z.object({
  $schema: z.string().optional(),
  contractVersion: z.string().default(SCHEMA_CONFIG.cliContractVersion).optional(),
  framework: z.enum(FRAMEWORKS as unknown as readonly [string, ...string[]]).default("none"),
  runtime: z.enum(RUNTIMES as unknown as readonly [string, ...string[]]).optional(),
  typescript: z.boolean().default(true),
  globalCss: z.string().default(SCHEMA_CONFIG.defaultGlobalCss),
  dir: z.string().default(SCHEMA_CONFIG.defaultDir),
  paths: pathsSchema,
  aliases: z
    .record(z.string(), z.string())
    .default(SCHEMA_CONFIG.defaultAliases as Record<string, string>),
  registry: z.string().default(SCHEMA_CONFIG.defaultRegistry),
  componentsDir: z.string().optional(),
  libDir: z.string().optional(),
  registryUrl: z.string().url().optional(),
  registryVersion: z.string().optional(),
  cdnBaseUrls: z.array(z.string()).optional(),
  strictCdn: z.boolean().default(false).optional(),
  importStyle: z.enum(["alias", "package"]).default("alias").optional(),
})

export type Config = z.infer<typeof configSchema>

export { CANONICAL_PATHS }
