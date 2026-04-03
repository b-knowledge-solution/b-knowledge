import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, '..')

/**
 * @description Copies backend runtime assets that TypeScript does not emit into dist.
 * @returns {void}
 * @throws {Error} Throws when a declared source asset is missing.
 */
function copyStaticAssets() {
  const assets = [
    {
      source: resolve(workspaceRoot, 'src/modules/llm-provider/data/factory-presets.json'),
      destination: resolve(workspaceRoot, 'dist/modules/llm-provider/data/factory-presets.json'),
    },
  ]

  for (const asset of assets) {
    // Fail the build early when a required runtime asset is missing from source control.
    if (!existsSync(asset.source)) {
      throw new Error(`Missing static asset: ${asset.source}`)
    }

    // Create the destination folder because tsc only emits compiled code directories.
    mkdirSync(dirname(asset.destination), { recursive: true })
    cpSync(asset.source, asset.destination)
  }
}

copyStaticAssets()
