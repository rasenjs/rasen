/**
 * Sync Snippets Script
 *
 * This script updates README files with code snippets from the www/snippets directory.
 * It looks for special markers in README files and replaces them with snippet content.
 *
 * Markers format:
 *   <!-- snippet:counter-dom -->
 *   <!-- /snippet -->
 *
 * Usage:
 *   node scripts/sync-snippets.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SNIPPETS_DIR = join(ROOT, 'www', 'snippets')

// Load all snippets
function loadSnippets() {
  const snippets = {}
  const files = readdirSync(SNIPPETS_DIR).filter(
    (f) => f.endsWith('.ts') || f.endsWith('.tsx')
  )

  for (const file of files) {
    const name = file.replace(/\.(ts|tsx)$/, '')
    const content = readFileSync(join(SNIPPETS_DIR, file), 'utf-8')
    snippets[name] = content
  }

  return snippets
}

// Update README with snippets
function updateReadme(filePath, snippets) {
  if (!existsSync(filePath)) {
    console.log(`  Skipping ${filePath} (not found)`)
    return false
  }

  let content = readFileSync(filePath, 'utf-8')
  let updated = false

  // Match <!-- snippet:name --> ... <!-- /snippet -->
  const pattern =
    /<!-- snippet:(\S+) -->\n```\w*\n[\s\S]*?```\n<!-- \/snippet -->/g

  content = content.replace(pattern, (match, snippetName) => {
    const snippet = snippets[snippetName]
    if (!snippet) {
      console.log(`  Warning: Snippet "${snippetName}" not found`)
      return match
    }

    updated = true
    const lang = snippetName.endsWith('tsx') ? 'tsx' : 'typescript'
    return `<!-- snippet:${snippetName} -->\n\`\`\`${lang}\n${snippet.trim()}\n\`\`\`\n<!-- /snippet -->`
  })

  if (updated) {
    writeFileSync(filePath, content)
    console.log(`  Updated ${filePath}`)
  }

  return updated
}

// Main
function main() {
  console.log('Loading snippets...')
  const snippets = loadSnippets()
  console.log(`  Found ${Object.keys(snippets).length} snippets`)

  console.log('\nUpdating README files...')

  // Update root README
  updateReadme(join(ROOT, 'README.md'), snippets)

  // Update package READMEs
  const packagesDir = join(ROOT, 'packages')
  const packages = readdirSync(packagesDir)

  for (const pkg of packages) {
    const readmePath = join(packagesDir, pkg, 'README.md')
    updateReadme(readmePath, snippets)
  }

  console.log('\nDone!')
}

main()
