import { readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artifactPaths, fileHash } from './artifacts.mjs'
import { SMOKE_CHECKS, validateSigningEvidence, validateSmokeEvidence } from './evidence.mjs'
import { ReleaseGateError } from './policy.mjs'

export async function finalizePlatform(rootDir, { platform = process.platform, arch = process.arch } = {}) {
  const { version } = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf8'))
  const paths = artifactPaths(rootDir, version, platform, arch)
  const signing = JSON.parse(await readFile(paths.status, 'utf8'))
  const smoke = JSON.parse(await readFile(join(rootDir, 'test-results', 'packaged-smoke', platform, 'smoke-report.json'), 'utf8'))
  validateSmokeEvidence(smoke, { version, platform, arch })
  const installerHash = await fileHash(paths.installer)
  validateSigningEvidence(signing, { version, platform, arch, mode: signing.mode,
    installerName: basename(paths.installer), installerHash })
  if (await fileHash(join(paths.upload, basename(paths.installer))) !== installerHash) {
    throw new ReleaseGateError('RELEASE_ARTIFACT_CHANGED_AFTER_VERIFICATION')
  }
  const publicReport = { schemaVersion: 1, status: 'passed', version, platform, arch,
    mode: signing.mode, installerSha256: installerHash,
    electronVersion: smoke.electronVersion, isPackaged: true, nativeSqliteLoaded: true,
    checks: Object.fromEntries(SMOKE_CHECKS.map((name) => [name, smoke.checks[name]])),
    runs: smoke.runs.map((run) => ({ run: run.run, exitCode: run.exitCode, crashed: run.crashed })) }
  await writeFile(join(paths.upload, `SMOKE-STATUS-${paths.key}.json`), `${JSON.stringify(publicReport, null, 2)}\n`, 'utf8')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await finalizePlatform(process.cwd()) } catch {
    console.error('PACKAGED_RELEASE_EVIDENCE_GATE_FAILED')
    process.exitCode = 1
  }
}
