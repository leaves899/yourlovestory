import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import test from 'node:test'
import { artifactPaths } from '../../scripts/release/artifacts.mjs'
import { packageRelease } from '../../scripts/release/package.mjs'
import { REQUIRED_SIGNING_INPUTS, ReleaseGateError, signingBuildEnvironment, validateReleasePolicy,
  validateSigningEnvironment } from '../../scripts/release/policy.mjs'
import { parseMacSigningDetails, refreshMacBlockmap, runCommand, verifyMac,
  verifyWindows } from '../../scripts/release/signing.mjs'

const version = '0.2.0-alpha.1'
const protectedEnv = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/master',
  GITHUB_REPOSITORY: 'leaves899/yourlovestory',
  GITHUB_REF_PROTECTED: 'true', RELEASE_SIGNING_ENVIRONMENT_VERIFIED: 'true' }
const appleIdentity = { APPLE_TEAM_ID: 'ABCDEFGHIJ', APPLE_API_KEY_ID: 'KLMNOPQRST',
  APPLE_API_ISSUER: '12345678-1234-1234-1234-123456789abc' }
const validSignature = { status: 'Valid', signerSha256: 'a'.repeat(64), timestamped: true }
const macDetails = 'Authority=Developer ID Application: Synthetic Test\nTeamIdentifier=ABCDEFGHIJ\nCodeDirectory v=20500 flags=0x10000(runtime)\n'

function policy(platform, env, mode = 'signed-prerelease', overrides = {}) {
  return validateReleasePolicy({ mode, version, platform, arch: 'x64', env, ...overrides })
}

async function withRoot(run) {
  const root = await mkdtemp(join(tmpdir(), 'yourcrush-signing-unit-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ version }))
    await writeFile(join(root, 'electron-builder.yml'), 'productName: yourcrush\n')
    await run(root)
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('unsigned prerelease disables signing even with ambient credentials', () => {
  const config = policy('darwin', {}, 'unsigned-prerelease')
  assert.equal(config.forceCodeSigning, false)
  assert.equal(config.mac.identity, null)
  assert.equal(config.mac.notarize, false)
  assert.equal(config.dmg.sign, false)
  const clean = signingBuildEnvironment({ PATH: 'path', CSC_LINK: 'synthetic-sensitive-value',
    WINDOWS_CSC_LINK: 'synthetic-sensitive-value', APPLE_API_KEY_BASE64: 'synthetic-sensitive-value',
    DEBUG: '*', ELECTRON_BUILDER_DEBUG: 'true', GH_TOKEN: 'synthetic-token', GITHUB_TOKEN: 'synthetic-token' },
  'unsigned-prerelease', 'darwin')
  assert.deepEqual(clean, { PATH: 'path', CSC_IDENTITY_AUTO_DISCOVERY: 'false' })
})

test('every release mode rejects Stable versions, unknown modes and unsupported architecture', () => {
  for (const mode of ['unsigned-prerelease', 'signed-prerelease']) {
    assert.throws(() => policy('linux', protectedEnv, mode, { version: '1.0.0' }), /PUBLIC_STABLE_RELEASE_NOT_AUTHORIZED/)
  }
  assert.throws(() => policy('linux', protectedEnv, 'unknown'), /INVALID_RELEASE_MODE/)
  assert.throws(() => policy('linux', protectedEnv, 'unsigned-prerelease', { arch: 'arm64' }), /UNSUPPORTED_RELEASE_PLATFORM/)
})

test('signed builds require protected Actions master and a verified environment', () => {
  for (const key of Object.keys(protectedEnv)) {
    assert.throws(() => policy('linux', { ...protectedEnv, [key]: '' }), /PROTECTED_SIGNING_CONTEXT_REQUIRED/)
  }
  assert.equal(policy('linux', protectedEnv).forceCodeSigning, false)
})

test('missing signing inputs fail by input name without exposing supplied values', () => {
  for (const platform of ['win32', 'darwin']) {
    const env = { ...protectedEnv, ...appleIdentity }
    assert.throws(() => policy(platform, env), (error) => {
      assert.equal(error.code, 'SIGNING_INPUTS_MISSING')
      assert.deepEqual(error.missing, REQUIRED_SIGNING_INPUTS[platform].filter((key) => !env[key]))
      assert.equal(error.message.includes(appleIdentity.APPLE_API_ISSUER), false)
      return true
    })
  }
})

test('signed platform inputs map only the relevant certificate and Apple key file', () => {
  const env = { ...protectedEnv, ...appleIdentity, MAC_CSC_LINK: 'synthetic-mac-certificate',
    MAC_CSC_KEY_PASSWORD: 'synthetic-password', WINDOWS_CSC_LINK: 'synthetic-windows-certificate',
    WINDOWS_CSC_KEY_PASSWORD: 'synthetic-other-password', APPLE_API_KEY_BASE64: 'synthetic-encoded-key' }
  const config = policy('darwin', env)
  assert.equal(config.forceCodeSigning, true)
  assert.equal(config.mac.notarize, true)
  assert.equal(config.mac.hardenedRuntime, true)
  assert.equal(config.dmg.sign, true)
  const mapped = signingBuildEnvironment(env, 'signed-prerelease', 'darwin', '/temporary/notarization.p8')
  assert.equal(mapped.CSC_LINK, env.MAC_CSC_LINK)
  assert.equal(mapped.APPLE_API_KEY, '/temporary/notarization.p8')
  assert.equal(mapped.WINDOWS_CSC_LINK, undefined)
  assert.equal(mapped.APPLE_API_KEY_BASE64, undefined)
  assert.throws(() => policy('darwin', { ...env, APPLE_TEAM_ID: 'bad' }), /APPLE_TEAM_ID_INVALID/)
  assert.throws(() => policy('darwin', { ...env, APPLE_API_ISSUER: '--bad' }), /APPLE_API_KEY_IDENTITY_INVALID/)
})

test('signing environment requires reviewers, no self review and protected branches only', () => {
  const environment = { name: 'release-signing', protection_rules: [{ type: 'required_reviewers',
    prevent_self_review: true, reviewers: [{ type: 'User', reviewer: { id: 1 } }] }],
  deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }
  validateSigningEnvironment(environment, true)
  assert.throws(() => validateSigningEnvironment(environment, false), /PROTECTION_REQUIRED/)
  assert.throws(() => validateSigningEnvironment({ ...environment, protection_rules: [] }, true), /PROTECTION_REQUIRED/)
  assert.throws(() => validateSigningEnvironment({ ...environment, protection_rules: [{ ...environment.protection_rules[0],
    prevent_self_review: false }] }, true), /PROTECTION_REQUIRED/)
  assert.throws(() => validateSigningEnvironment({ ...environment,
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }, true), /PROTECTION_REQUIRED/)
})

test('Windows verifies both application and installer with the same timestamped signer', async () => {
  const targets = []
  const checks = await verifyWindows({ rootDir: '/repo', executable: '/app/yourcrush.exe',
    installer: '/release/setup.exe', signed: true, run: async (command, args) => {
      assert.equal(command, 'powershell.exe')
      targets.push(args.at(-1))
      return { code: 0, stdout: JSON.stringify(validSignature), stderr: '' }
    } })
  assert.deepEqual(targets, ['/app/yourcrush.exe', '/release/setup.exe'])
  assert.equal(checks.length, 2)
  assert.equal(checks.every((check) => check.timestamped), true)
})

test('Windows rejects absent timestamps, invalid signatures, malformed observations and signer mismatch', async () => {
  const base = { rootDir: '/repo', executable: '/app/yourcrush.exe', installer: '/release/setup.exe', signed: true }
  for (const signature of [{ ...validSignature, status: 'NotTrusted' }, { ...validSignature, timestamped: false }]) {
    await assert.rejects(verifyWindows({ ...base, run: async () => ({ code: 0, stdout: JSON.stringify(signature) }) }), /NOT_VALID/)
  }
  await assert.rejects(verifyWindows({ ...base, run: async () => ({ code: 0, stdout: 'sensitive malformed output' }) }), /STATUS_INVALID/)
  let count = 0
  await assert.rejects(verifyWindows({ ...base, run: async () => ({ code: 0,
    stdout: JSON.stringify({ ...validSignature, signerSha256: (++count === 1 ? 'a' : 'b').repeat(64) }) }) }), /SIGNER_MISMATCH/)
})

test('unsigned Windows reports an observed vendor signature without claiming release signing', async () => {
  const checks = await verifyWindows({ rootDir: '/repo', executable: '/app/yourcrush.exe',
    installer: '/release/setup.exe', signed: false,
    run: async () => ({ code: 0, stdout: JSON.stringify(validSignature) }) })
  assert.equal(checks[0].status, 'Valid')
  assert.equal(checks[0].check, 'authenticode')
})

function mockMac({ details = macDetails, status = 'Accepted', failAt } = {}) {
  const calls = []
  const run = async (command, args) => {
    calls.push([command, ...args])
    if (failAt && args.join(' ').includes(failAt)) return { code: 1, stdout: '', stderr: 'synthetic-private-error' }
    if (command === 'codesign' && args[0] === '--display') return { code: 0, stdout: '', stderr: details }
    if (args[0] === 'notarytool') return { code: 0, stdout: JSON.stringify({ status }), stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  }
  return { run, calls }
}

test('macOS requires Developer ID, hardened runtime, matching team, app and final DMG notarization', async () => {
  assert.deepEqual(parseMacSigningDetails(macDetails), { developerId: true, teamId: 'ABCDEFGHIJ', hardenedRuntime: true })
  const mock = mockMac()
  const checks = await verifyMac({ application: '/app/yourcrush.app', installer: '/release/setup.dmg',
    signed: true, appleKeyPath: '/temporary/key.p8', env: appleIdentity, run: mock.run })
  assert.equal(checks.length, 4)
  assert.equal(mock.calls.some((args) => args.includes('submit') && args.includes('/release/setup.dmg')), true)
  assert.equal(mock.calls.some((args) => args.includes('staple') && args.includes('/release/setup.dmg')), true)
  assert.equal(mock.calls.filter((args) => args.includes('validate')).length, 2)
  assert.equal(mock.calls.filter((args) => args[0] === 'spctl').length, 2)
})

test('macOS refuses ad hoc identity, wrong team, rejected notarization and missing staples', async () => {
  const base = { application: '/app/yourcrush.app', installer: '/release/setup.dmg',
    signed: true, appleKeyPath: '/temporary/key.p8', env: appleIdentity }
  for (const details of ['Signature=adhoc\n', macDetails.replace('ABCDEFGHIJ', 'ZZZZZZZZZZ'),
    macDetails.replace('runtime', 'none')]) {
    await assert.rejects(verifyMac({ ...base, run: mockMac({ details }).run }), /IDENTITY_NOT_VALID/)
  }
  await assert.rejects(verifyMac({ ...base, run: mockMac({ status: 'Invalid' }).run }), /NOT_ACCEPTED/)
  await assert.rejects(verifyMac({ ...base, run: mockMac({ failAt: 'stapler validate' }).run }), /NOT_STAPLED/)
  await assert.rejects(verifyMac({ ...base, run: mockMac({ failAt: '--type open' }).run }), /GATEKEEPER_REJECTED/)
})

test('unsigned macOS never submits an Apple notarization request', async () => {
  const mock = mockMac({ details: 'Signature=adhoc\n' })
  const checks = await verifyMac({ application: '/app/yourcrush.app', installer: '/release/setup.dmg', signed: false,
    env: {}, run: mock.run })
  assert.equal(mock.calls.length, 1)
  assert.equal(checks[0].notarization, 'not-requested')
})

test('final stapled DMG gets a fresh external differential block map', async () => {
  let argumentsUsed
  await refreshMacBlockmap('/release/setup.dmg', async (_command, args) => {
    argumentsUsed = args
    return { code: 0 }
  })
  assert.deepEqual(argumentsUsed, ['blockmap', '--input', '/release/setup.dmg', '--output', '/release/setup.dmg.blockmap'])
})

test('tool failures, timeouts and output limits expose safe error codes only', async () => {
  await assert.rejects(runCommand('yourcrush-unit-missing-command', []), /SIGNING_TOOL_UNAVAILABLE/)
  await assert.rejects(runCommand(process.execPath, ['-e', 'setTimeout(()=>{}, 1000)'], { timeoutMs: 10 }), /SIGNING_TOOL_TIMEOUT/)
  await assert.rejects(runCommand(process.execPath, ['-e', 'process.stdout.write("synthetic-sensitive-value".repeat(100))'],
    { maxOutputBytes: 100 }), (error) => error.message === 'SIGNING_TOOL_OUTPUT_LIMIT')
})

test('missing secrets never invoke builder and diagnostics contain names only', async () => {
  await withRoot(async (root) => {
    let invoked = false
    await assert.rejects(packageRelease({ rootDir: root, mode: 'signed-prerelease', platform: 'win32', arch: 'x64',
      env: { ...protectedEnv, WINDOWS_CSC_LINK: 'synthetic-sensitive-value' },
      run: async () => { invoked = true; throw new Error('must not invoke') } }), /WINDOWS_CSC_KEY_PASSWORD/)
    assert.equal(invoked, false)
    const reportText = await readFile(artifactPaths(root, version, 'win32', 'x64').status, 'utf8')
    assert.equal(reportText.includes('synthetic-sensitive-value'), false)
    assert.deepEqual(JSON.parse(reportText).externalBlockers, ['WINDOWS_CSC_KEY_PASSWORD'])
  })
})

test('builder is always offline from publishing and unsigned Linux stages its installer', async () => {
  await withRoot(async (root) => {
    const paths = artifactPaths(root, version, 'linux', 'x64')
    const { report } = await packageRelease({ rootDir: root, mode: 'unsigned-prerelease', platform: 'linux', arch: 'x64',
      env: {}, run: async (_command, args, options) => {
        assert.deepEqual(args.slice(-2), ['--publish', 'never'])
        const config = JSON.parse(await readFile(args[args.indexOf('--config') + 1], 'utf8'))
        assert.equal(config.forceCodeSigning, false)
        assert.equal(options.env.CSC_IDENTITY_AUTO_DISCOVERY, 'false')
        await mkdir(join(root, 'release'), { recursive: true })
        await writeFile(join(root, 'release', `yourcrush-${version}-linux.AppImage`), 'synthetic installer')
        return { code: 0 }
      } })
    assert.equal(report.status, 'passed')
    assert.equal(report.releaseCodeSigning, 'not-applicable')
    assert.equal((await readdir(paths.upload)).includes(basename(paths.installer)), true)
  })
})

test('unsigned Windows preserves the package when signature observation is unavailable', async () => {
  await withRoot(async (root) => {
    const paths = artifactPaths(root, version, 'win32', 'x64')
    let calls = 0
    const { report } = await packageRelease({ rootDir: root, mode: 'unsigned-prerelease', platform: 'win32', arch: 'x64',
      env: {}, run: async () => {
        calls += 1
        if (calls === 1) {
          await mkdir(join(root, 'release', 'win-unpacked'), { recursive: true })
          await writeFile(paths.application, 'synthetic app')
          await writeFile(paths.installer, 'synthetic installer')
          return { code: 0 }
        }
        return { code: 1, stdout: '', stderr: '' }
      } })
    assert.equal(report.status, 'passed')
    assert.deepEqual(report.checks.map((check) => check.status), ['unavailable', 'unavailable'])
    assert.equal((await readdir(paths.upload)).includes(basename(paths.installer)), true)
  })
})

test('unsigned Windows records unavailable when the observation tool cannot start', async () => {
  await withRoot(async (root) => {
    const paths = artifactPaths(root, version, 'win32', 'x64')
    let calls = 0
    const { report } = await packageRelease({ rootDir: root, mode: 'unsigned-prerelease', platform: 'win32', arch: 'x64',
      env: {}, run: async () => {
        calls += 1
        if (calls === 1) {
          await mkdir(join(root, 'release', 'win-unpacked'), { recursive: true })
          await writeFile(paths.application, 'synthetic app')
          await writeFile(paths.installer, 'synthetic installer')
          return { code: 0 }
        }
        throw new ReleaseGateError('SIGNING_TOOL_UNAVAILABLE')
      } })
    assert.equal(report.status, 'passed')
    assert.deepEqual(report.checks.map((check) => check.status), ['unavailable', 'unavailable'])
  })
})

test('temporary Apple credential is removed after builder failure and raw errors are redacted', async () => {
  await withRoot(async (root) => {
    await mkdir(join(root, 'temporary'))
    const boundary = '-'.repeat(5)
    const key = `${boundary}BEGIN PRIVATE KEY${boundary}\nsynthetic-unit-data\n${boundary}END PRIVATE KEY${boundary}\n`
    const env = { ...protectedEnv, ...appleIdentity, RUNNER_TEMP: join(root, 'temporary'),
      MAC_CSC_LINK: 'synthetic-sensitive-certificate', MAC_CSC_KEY_PASSWORD: 'synthetic-sensitive-password',
      APPLE_API_KEY_BASE64: Buffer.from(key).toString('base64') }
    let keyPath
    await assert.rejects(packageRelease({ rootDir: root, mode: 'signed-prerelease', platform: 'darwin', arch: 'x64', env,
      run: async (_command, _args, options) => {
        keyPath = options.env.APPLE_API_KEY
        assert.equal(await readFile(keyPath, 'utf8'), key)
        return { code: 1, stderr: 'synthetic-sensitive-error' }
      } }), (error) => error.message === 'ELECTRON_BUILDER_FAILED')
    await assert.rejects(stat(keyPath), (error) => error.code === 'ENOENT')
    assert.deepEqual(await readdir(join(root, 'temporary')), [])
    const text = await readFile(artifactPaths(root, version, 'darwin', 'x64').status, 'utf8')
    assert.equal(text.includes('synthetic-sensitive'), false)
    assert.equal(text.includes(key), false)
  })
})
