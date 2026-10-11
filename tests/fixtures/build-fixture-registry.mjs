// Generates a SYNTHETIC static registry (no real ui8kit content) that reproduces the four registry gaps.
// Layout per runtime root (what the CLI expects): index.json, components/ui/<n>.json, components/<n>.json,
// blocks/<n>.json, utils/utils.json, lib/presets.json.
//
//   gap 1  button.<ext> imports ./button.helpers (a .ts file the runtime filter would drop); every block ships *.types.ts
//   gap 2  every item lists "utils"; blocks/components list "presets" or "lib/presets" (registry:lib)
//   gap 3  targets are registry specific (primitives/..., presets/...) except `badge` (canonical components/ui/...)
//   gap 4  feature-grid <-> feature-cards (type-only back edge), section-frame <-> section-header (value + type edge)
import fs from "node:fs"
import path from "node:path"

const EXT = { svelte: "svelte", react: "tsx", vue: "vue" }

function item(rt, name, type, files, registryDependencies = [], extra = {}) {
  return {
    $schema: "https://example.invalid/schema/registry-item.json",
    name,
    type,
    title: name,
    description: `Synthetic ${name}`,
    runtime: rt,
    dependencies: [],
    devDependencies: [],
    registryDependencies,
    files: files.map(([target, content]) => ({ path: target, target, content })),
    ...extra,
  }
}

export function fixtureItems(rt) {
  const ext = EXT[rt]
  const view = (body) => (rt === "react" ? `export const X = () => null\n// ${body}\n` : `<!-- ${body} -->\n`)
  const items = []

  items.push(
    item(rt, "utils", "registry:utils", [
      ["utils/cn.ts", "export const cn = (...a: string[]) => a.join(' ')\n"],
      ["utils/index.ts", "export { cn } from './cn'\n"],
    ]),
    item(rt, "presets", "registry:lib", [["presets/defaults.ts", "export const defaults = { gap: 'gap-4' }\n"]]),
  )

  items.push(
    item(
      rt,
      "button",
      "registry:ui",
      [
        [`primitives/button/button.${ext}`, view("button") + `import { label } from "./button.helpers"\nimport { cn } from "../../utils"\n`],
        ["primitives/button/button.helpers.ts", "export const label = 'button'\n"],
      ],
      ["utils"],
    ),
    item(rt, "card", "registry:ui", [[`primitives/card/card.${ext}`, view("card") + `import { cn } from "../../utils"\n`]], ["utils"]),
    item(
      rt,
      "badge",
      "registry:ui",
      [[`components/ui/badge/badge.${ext}`, view("badge") + `import { cn } from "../../../utils"\n`]],
      ["utils"],
    ),
  )

  // gap 4a: feature-grid (value import of feature-cards) <-> feature-cards (type-only import from feature-grid.types)
  items.push(
    item(
      rt,
      "feature-grid",
      "registry:block",
      [
        [
          `blocks/feature-grid.${ext}`,
          view("feature-grid") +
            `import type { Feature } from "./feature-grid.types"\nimport { FeatureCards } from "../components/feature-cards.${ext}"\nimport { defaults } from "../presets/defaults"\nimport { cn } from "../utils"\n`,
        ],
        ["blocks/feature-grid.types.ts", "export type Feature = { title: string }\n"],
      ],
      ["feature-cards", "section-frame", "card", "lib/presets", "utils"],
    ),
    item(
      rt,
      "feature-cards",
      "registry:component",
      [
        [
          `components/feature-cards.${ext}`,
          view("feature-cards") +
            `import type { Feature } from "../blocks/feature-grid.types"\nimport Card from "../primitives/card/card.${ext}"\nimport { defaults } from "../presets/defaults"\nimport { cn } from "../utils"\n`,
        ],
      ],
      ["card", "feature-grid", "presets", "utils"],
    ),
  )

  // gap 4b: section-frame (value import of section-header) <-> section-header (type import of section-frame.types)
  items.push(
    item(
      rt,
      "section-frame",
      "registry:component",
      [
        [
          `components/section-frame.${ext}`,
          view("section-frame") +
            `import type { Heading } from "./section-frame.types"\nimport SectionHeader from "./section-header.${ext}"\nimport { cn } from "../utils"\n`,
        ],
        ["components/section-frame.types.ts", "export type Heading = { text: string }\n"],
      ],
      ["section-header", "utils"],
    ),
    item(
      rt,
      "section-header",
      "registry:component",
      [
        [
          `components/section-header.${ext}`,
          view("section-header") + `import type { Heading } from "./section-frame.types"\nimport Button from "../primitives/button/button.${ext}"\nimport { cn } from "../utils"\n`,
        ],
      ],
      ["section-frame", "button", "utils"],
    ),
  )

  items.push(
    item(
      rt,
      "hero-split",
      "registry:block",
      [
        [
          `blocks/hero-split.${ext}`,
          view("hero-split") +
            `import type { Hero } from "./hero-split.types"\nimport { FeatureGrid } from "./feature-grid.${ext}"\nimport SectionFrame from "../components/section-frame.${ext}"\nimport Button from "../primitives/button/button.${ext}"\nimport { defaults } from "../presets/defaults"\nimport { cn } from "../utils"\n`,
        ],
        ["blocks/hero-split.types.ts", "export type Hero = { title: string }\n"],
      ],
      ["feature-grid", "section-frame", "button", "presets", "utils"],
    ),
  )
  return items
}

const FOLDER = {
  "registry:ui": "components/ui",
  "registry:component": "components",
  "registry:block": "blocks",
  "registry:utils": "utils",
  "registry:lib": "lib",
}

/** Writes `<dir>/<rt>/...` for every runtime and returns the list of item names. */
export function buildFixtureRegistry(dir, runtimes = ["svelte", "react"]) {
  for (const rt of runtimes) {
    const items = fixtureItems(rt)
    const root = path.join(dir, rt)
    for (const it of items) {
      const file = path.join(root, FOLDER[it.type], `${it.name}.json`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(it, null, 2))
    }
    const index = {
      components: items.map(({ name, type, description, registryDependencies }) => ({ name, type, description, registryDependencies })),
    }
    fs.writeFileSync(path.join(root, "index.json"), JSON.stringify(index, null, 2))
  }
  return fixtureItems(runtimes[0]).map((i) => i.name)
}
