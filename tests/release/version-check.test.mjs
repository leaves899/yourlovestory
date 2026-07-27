import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, win32 } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import {
  checkVersionState,
  isValidReleaseVersion,
  isValidSemVer,
  loadVersionState,
} from '../../scripts/lib/version-check.mjs'

const policy = '<!-- supported-version-policy: current-prerelease-only -->'

function state(overrides = {}) {
  const version = overrides.version ?? '1.2.3'
  return {
    packageJson: { version },
    packageLock: { version, packages: { '': { version } } },
    securityText: `${policy}\nCurrent prerelease only`,
    changelogText: `## [${version}]`,
    gitRef: '',
    gitTags: ['v0.1.0-alpha.1'],
    ...overrides,
  }
}

test('accepts stable and prerelease SemVer', () => {
  assert.equal(isValidSemVer('1.2.3'), true)
  assert.equal(isValidSemVer('0.2.0-alpha.1'), true)
  assert.equal(isValidReleaseVersion('1.2.3'), true)
  assert.equal(isValidReleaseVersion('0.2.0-alpha.1'), true)
  assert.equal(isValidReleaseVersion('0.2.0-beta.2'), true)
  assert.equal(isValidReleaseVersion('0.2.0-rc.3'), true)
  assert.deepEqual(checkVersionState(state()), [])
  assert.deepEqual(checkVersionState(state({ version: '0.2.0-alpha.1' })), [])
})

test('rejects invalid SemVer', () => {
  assert.equal(isValidSemVer('01.2.3'), false)
  assert.equal(isValidSemVer('1.2.3-alpha.01'), false)
  assert.match(checkVersionState(state({ version: 'not-a-version' }))[0], /package\.json/)
})

test('rejects SemVer outside the project release policy', () => {
  for (const version of ['1.2.3-alpha', '1.2.3-alpha.0', '1.2.3-preview.1', '1.2.3+build.1']) {
    assert.equal(isValidSemVer(version), true)
    assert.equal(isValidReleaseVersion(version), false)
    assert.match(checkVersionState(state({ version }))[0], /docs\/release\/versioning\.md/)
  }
})

test('reports both package-lock version mismatches', () => {
  const errors = checkVersionState(state({
    packageLock: { version: '1.2.2', packages: { '': { version: '1.2.1' } } },
  }))
  assert.equal(errors.length, 2)
  assert.match(errors[0], /预期|应为/)
  assert.match(errors[0], /实际/)
})

test('requires tag CI to match package version', () => {
  const errors = checkVersionState(state({ gitRef: 'refs/tags/v1.2.4' }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /v1\.2\.3/)
})

test('ignores branch CI refs', () => {
  assert.deepEqual(checkVersionState(state({ gitRef: 'refs/heads/master' })), [])
})

test('detects security policy conflicts', () => {
  const errors = checkVersionState(state({ securityText: `${policy}\n| 0.1.x | supported |` }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /0\.1\.x/)
})

test('reports missing files without exposing environment values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yourcrush-version-'))
  const secret = 'DO_NOT_LEAK_TEST_SECRET'
  process.env.VERSION_TEST_SECRET = secret
  try {
    await writeFile(join(root, 'package.json'), '{"version":"1.2.3"}', 'utf8')
    const result = await loadVersionState(root)
    assert.ok(result.errors.length >= 3)
    assert.equal(result.errors.join('\n').includes(secret), false)
  } finally {
    delete process.env.VERSION_TEST_SECRET
    await rm(root, { recursive: true, force: true })
  }
})

test('accepts a Windows-style root after path normalization by the caller', () => {
  const windowsPath = win32.join('C:\\workspace', 'yourcrush', 'package.json')
  assert.equal(windowsPath, 'C:\\workspace\\yourcrush\\package.json')
  assert.deepEqual(checkVersionState(state()), [])
})

test('reports an invalid existing tag', () => {
  const errors = checkVersionState(state({ gitTags: ['release-1.2.3'] }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /vX\.Y\.Z/)
})
