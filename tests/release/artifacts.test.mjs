import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { artifactPaths, fileHash, stageArtifacts } from '../../scripts/release/artifacts.mjs'
import { collectArtifacts } from '../../scripts/release/collect-artifacts.mjs'
import { SMOKE_CHECKS, validateSmokeEvidence } from '../../scripts/release/evidence.mjs'
import { finalizePlatform } from '../../scripts/release/finalize-platform.mjs'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')
const version = '0.2.0-alpha.1'
const labels = { windows: 'win32', macos: 'darwin', linux: 'linux' }

async function withRoot(run) {
  const root = await mkdtemp(join(tmpdir(), 'yourcrush-release-artifacts-unit-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ version }))
    await run(root)
  } finally { await rm(root, { recursive: true, force: true }) }
}

function smokeReport(platform, { publicReport = true, installerHash = 'a'.repeat(64), mode = 'unsigned-prerelease' } = {}) {
  return { schemaVersion: 1, status: 'passed', platform, arch: 'x64',
    ...(publicReport ? { version, mode, installerSha256: installerHash } : { appVersion: version, errors: [] }),
    electronVersion: '28.3.3', isPackaged: true, nativeSqliteLoaded: true,
    checks: Object.fromEntries(SMOKE_CHECKS.map((name) => [name, true])),
    runs: [1, 2].map((run) => ({ run, exitCode: 0, exitSignal: null, crashed: false })) }
}

async function signingReport(paths, platform, mode = 'unsigned-prerelease') {
  const signed = mode === 'signed-prerelease'
  let checks = []
  if (signed && platform === 'win32') {
    checks = ['yourcrush.exe', basename(paths.installer)].map((target) => ({ check: 'authenticode',
      target, status: 'Valid', timestamped: true, signerSha256: 'a'.repeat(64) }))
  } else if (signed && platform === 'darwin') {
    checks = ['developer-id-app-signature', 'app-notarization-staple-and-gatekeeper',
      'developer-id-dmg-signature', 'dmg-notarization-staple-and-gatekeeper']
      .map((check) => ({ check, status: 'passed',
        target: check.startsWith('developer-id-app') || check.startsWith('app-notarization')
          ? 'yourcrush.app' : basename(paths.installer),
        ...(check === 'developer-id-app-signature' ? { hardenedRuntime: true } : {}) }))
  }
  return { schemaVersion: 1, status: 'passed', version, platform, arch: 'x64', mode, checks,
    releaseCodeSigning: platform === 'linux' ? 'not-applicable' : signed ? 'verified' : 'not-configured',
    notarization: platform !== 'darwin' ? 'not-applicable' : signed ? 'verified' : 'not-configured',
    artifacts: [{ name: basename(paths.installer), sha256: await fileHash(paths.installer) }],
    failureCode: null, externalBlockers: [] }
}

async function makePlatform(root, platform, mode = 'unsigned-prerelease') {
  const paths = artifactPaths(root, version, platform, 'x64')
  await mkdir(join(root, 'release', 'signing'), { recursive: true })
  await writeFile(paths.installer, `synthetic ${platform} installer after final signing/stapling`)
  const signing = await signingReport(paths, platform, mode)
  await writeFile(paths.status, JSON.stringify(signing))
  return { paths, signing }
}

async function makeDownloads(root, mode = 'unsigned-prerelease') {
  const sourceDir = join(root, 'download')
  await mkdir(sourceDir)
  const reports = {}
  for (const [label, platform] of Object.entries(labels)) {
    const { paths, signing } = await makePlatform(join(root, label), platform, mode)
    const folder = join(sourceDir, `release-files-${version}-${label}`)
    await mkdir(folder)
    const bytes = await readFile(paths.installer)
    await writeFile(join(folder, basename(paths.installer)), bytes)
    const signingPath = join(folder, basename(paths.status))
    await writeFile(signingPath, JSON.stringify(signing))
    const smokePath = join(folder, `SMOKE-STATUS-${paths.key}.json`)
    const smoke = smokeReport(platform, { installerHash: signing.artifacts[0].sha256, mode })
    await writeFile(smokePath, JSON.stringify(smoke))
    reports[label] = { folder, paths, signing, signingPath, smoke, smokePath }
  }
  return { sourceDir, targetDir: join(root, 'collected'), version, mode, reports }
}

test('staging refreshes final DMG hashes and excludes builder diagnostics and unrelated versions', async () => {
  await withRoot(async (root) => {
    const { paths } = await makePlatform(root, 'darwin')
    const manifestName = 'latest-mac.yml'
    const installerName = basename(paths.installer)
    await writeFile(join(root, 'release', manifestName), yaml.dump({ version, path: installerName,
      sha512: 'stale-before-stapling', files: [{ url: installerName, sha512: 'stale-before-stapling', size: 1 }] }))
    await writeFile(join(root, 'release', 'builder-debug.yml'), 'synthetic-private-debug')
    await writeFile(join(root, 'release', 'old-version.dmg'), 'old installer')
    await writeFile(`${paths.installer}.blockmap`, 'synthetic final blockmap')
    const names = await stageArtifacts({ rootDir: root, version, platform: 'darwin', arch: 'x64', statusPath: paths.status })
    assert.equal(names.includes('builder-debug.yml'), false)
    assert.equal(names.includes('old-version.dmg'), false)
    assert.equal(names.includes(`${installerName}.blockmap`), true)
    const manifest = yaml.load(await readFile(join(paths.upload, manifestName), 'utf8'))
    const sha512 = await fileHash(paths.installer, 'sha512', 'base64')
    assert.equal(manifest.sha512, sha512)
    assert.equal(manifest.files[0].sha512, sha512)
    assert.equal(manifest.files[0].size, (await readFile(paths.installer)).length)
  })
})

test('staging rejects wrong manifest version or external artifact reference before copying', async () => {
  for (const override of [{ version: '0.1.0-alpha.1' }, { path: '../other.dmg' },
    { files: [{ url: 'other.dmg' }] }]) {
    await withRoot(async (root) => {
      const { paths } = await makePlatform(root, 'darwin')
      const installerName = basename(paths.installer)
      await writeFile(join(root, 'release', 'latest-mac.yml'), yaml.dump({ version, path: installerName,
        files: [{ url: installerName }], ...override }))
      await assert.rejects(stageArtifacts({ rootDir: root, version, platform: 'darwin', arch: 'x64', statusPath: paths.status }), /MANIFEST_MISMATCH/)
      await assert.rejects(readdir(paths.upload), (error) => error.code === 'ENOENT')
    })
  }
})

test('staging never overwrites a nonempty upload directory', async () => {
  await withRoot(async (root) => {
    const { paths } = await makePlatform(root, 'linux')
    await mkdir(paths.upload)
    await writeFile(join(paths.upload, 'existing.bin'), 'preserve')
    await assert.rejects(stageArtifacts({ rootDir: root, version, platform: 'linux', arch: 'x64', statusPath: paths.status }), /DIRECTORY_NOT_EMPTY/)
    assert.deepEqual(await readdir(paths.upload), ['existing.bin'])
  })
})

test('smoke evidence requires every named check and two successful runs, never vacuous success', () => {
  const original = smokeReport('linux', { publicReport: false })
  const context = { version, platform: 'linux', arch: 'x64' }
  validateSmokeEvidence(original, context)
  for (const override of [{ checks: {} }, { nativeSqliteLoaded: false }, { isPackaged: false },
    { appVersion: '0.1.0-alpha.1' }, { runs: [] }, { errors: ['synthetic error'] },
    { runs: [{ run: 1, exitCode: 0, exitSignal: null, crashed: false }, { run: 2, exitCode: 1, crashed: true }] }]) {
    assert.throws(() => validateSmokeEvidence({ ...original, ...override }, context), /EVIDENCE_NOT_VALID/)
  }
})

test('finalize binds smoke evidence and strips synthetic private paths and full errors', async () => {
  await withRoot(async (root) => {
    const { paths } = await makePlatform(root, 'linux')
    await stageArtifacts({ rootDir: root, version, platform: 'linux', arch: 'x64', statusPath: paths.status })
    const smoke = { ...smokeReport('linux', { publicReport: false }), userDataPath: 'synthetic-private-user-data',
      executable: 'synthetic-private-path', projectSlug: 'synthetic-private-project' }
    const smokeDir = join(root, 'test-results', 'packaged-smoke', 'linux')
    await mkdir(smokeDir, { recursive: true })
    await writeFile(join(smokeDir, 'smoke-report.json'), JSON.stringify(smoke))
    await finalizePlatform(root, { platform: 'linux', arch: 'x64' })
    const text = await readFile(join(paths.upload, `SMOKE-STATUS-${paths.key}.json`), 'utf8')
    assert.equal(text.includes('synthetic-private'), false)
    assert.equal(JSON.parse(text).installerSha256, await fileHash(paths.installer))
    await writeFile(join(paths.upload, basename(paths.installer)), 'changed staged artifact')
    await assert.rejects(finalizePlatform(root, { platform: 'linux', arch: 'x64' }), /CHANGED_AFTER_VERIFICATION/)
  })
})

test('collector requires all three verified platform reports and checksums cover every uploaded file', async () => {
  await withRoot(async (root) => {
    const fixture = await makeDownloads(root)
    const result = await collectArtifacts(fixture)
    assert.equal(result.files.length, 9)
    const names = await readdir(fixture.targetDir)
    assert.equal(names.length, 10)
    assert.equal(names.includes('SHA256SUMS.txt'), true)
    const checksum = await readFile(result.outputPath, 'utf8')
    assert.equal(checksum.includes('SHA256SUMS.txt'), false)
    for (const name of result.files) assert.equal(checksum.includes(`${await fileHash(join(fixture.targetDir, name))}  ${name}\n`), true)
  })
})

test('collector accepts synthetic signed evidence only when Windows and macOS checks are complete', async () => {
  await withRoot(async (root) => {
    const fixture = await makeDownloads(root, 'signed-prerelease')
    await collectArtifacts(fixture)
    assert.equal((await readdir(fixture.targetDir)).length, 10)
  })
})

test('collector rejects wrong mode, missing platform and changed final installer', async () => {
  for (const mutate of [
    async (fixture) => { fixture.mode = 'signed-prerelease' },
    async (fixture) => { await rm(fixture.reports.macos.folder, { recursive: true }) },
    async (fixture) => { await writeFile(join(fixture.reports.windows.folder,
      basename(fixture.reports.windows.paths.installer)), 'changed after verification') },
  ]) {
    await withRoot(async (root) => {
      const fixture = await makeDownloads(root)
      await mutate(fixture)
      await assert.rejects(collectArtifacts(fixture), /NOT_VALID/)
      await assert.rejects(readdir(fixture.targetDir), (error) => error.code === 'ENOENT')
    })
  }
})

test('collector refuses signed state claims without notarization, timestamp or complete checks', async () => {
  for (const [label, mutate] of [
    ['macos', (report) => { report.notarization = 'not-configured' }],
    ['macos', (report) => { report.checks = [] }],
    ['windows', (report) => { report.checks[0].timestamped = false }],
  ]) {
    await withRoot(async (root) => {
      const fixture = await makeDownloads(root, 'signed-prerelease')
      const item = fixture.reports[label]
      mutate(item.signing)
      await writeFile(item.signingPath, JSON.stringify(item.signing))
      await assert.rejects(collectArtifacts(fixture), /NOT_VALID/)
    })
  }
})

test('collector rejects stale manifests, unknown files and filename collision risks without merging', async () => {
  for (const name of ['builder-debug.yml', 'old-version.exe', 'latest.yml']) {
    await withRoot(async (root) => {
      const fixture = await makeDownloads(root)
      for (const label of ['windows', 'macos']) {
        await writeFile(join(fixture.reports[label].folder, name), yaml.dump({ version: '0.1.0-alpha.1', files: [] }))
      }
      await assert.rejects(collectArtifacts(fixture), /NOT_VALID|MISMATCH/)
      await assert.rejects(readdir(fixture.targetDir), (error) => error.code === 'ENOENT')
    })
  }
})

test('collector rejects malformed or unbound smoke evidence and does not overwrite prior output', async () => {
  await withRoot(async (root) => {
    const fixture = await makeDownloads(root)
    const item = fixture.reports.linux
    await writeFile(item.smokePath, JSON.stringify({ ...item.smoke, installerSha256: 'b'.repeat(64) }))
    await assert.rejects(collectArtifacts(fixture), /SMOKE_ARTIFACT_MISMATCH/)
    await writeFile(item.smokePath, JSON.stringify(item.smoke))
    await mkdir(fixture.targetDir)
    await writeFile(join(fixture.targetDir, 'keep.txt'), 'preserve')
    await assert.rejects(collectArtifacts(fixture), /DIRECTORY_NOT_EMPTY/)
    assert.deepEqual(await readdir(fixture.targetDir), ['keep.txt'])
  })
})
