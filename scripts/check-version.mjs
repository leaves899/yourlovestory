import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { checkVersionState, loadVersionState } from './lib/version-check.mjs'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let gitTags = []

try {
  gitTags = execFileSync('git', ['tag', '--list'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).split(/\r?\n/).filter(Boolean)
} catch {
  // Source archives may not include .git. Tag CI is still checked through GITHUB_REF.
}

const loaded = await loadVersionState(rootDir, {
  gitRef: process.env.GITHUB_REF ?? '',
  gitTags,
})
const errors = [...loaded.errors]
if (loaded.state) errors.push(...checkVersionState(loaded.state))

if (errors.length > 0) {
  console.error('Version consistency check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log(`Version consistency check passed: ${loaded.state.packageJson.version}`)
}
