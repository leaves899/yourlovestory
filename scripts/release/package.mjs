import { mkdtemp, mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artifactPaths, fileHash, stageArtifacts } from './artifacts.mjs'
import { PLATFORM_NAMES, ReleaseGateError, signingBuildEnvironment, validateReleasePolicy } from './policy.mjs'
import { refreshMacBlockmap, runCommand, verifyMac, verifyWindows } from './signing.mjs'

export async function packageRelease({ rootDir, mode, platform = process.platform, arch = process.arch,
  env = process.env, run = runCommand }) {
  const { version } = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf8'))
  // Use a safe diagnostic filename even if the package version is invalid.
  const safeVersion = /^[a-zA-Z0-9.+-]+$/.test(version ?? '') ? version : 'invalid-version'
  const paths = artifactPaths(rootDir, safeVersion, platform, arch)
  const signed = mode === 'signed-prerelease'
  const report = { schemaVersion: 1, version, platform, arch, mode, status: 'failed',
    releaseCodeSigning: 'not-configured', notarization: 'not-configured', checks: [],
    artifacts: [], externalBlockers: [], failureCode: null }
  let temporary
  let phase = 'RELEASE_POLICY_FAILED'
  try {
    const config = validateReleasePolicy({ mode, version, platform, arch, env })
    temporary = await mkdtemp(join(env.RUNNER_TEMP || tmpdir(), 'yourcrush-release-signing-'))
    const configPath = join(temporary, 'builder.json')
    let appleKeyPath
    if (signed && platform === 'darwin') {
      const encoded = env.APPLE_API_KEY_BASE64.trim()
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
        throw new ReleaseGateError('APPLE_API_KEY_BASE64_INVALID')
      }
      appleKeyPath = join(temporary, 'notarization.p8')
      const key = Buffer.from(encoded, 'base64')
      if (!/^-{5}BEGIN PRIVATE KEY-{5}\r?\n[\s\S]+\r?\n-{5}END PRIVATE KEY-{5}\s*$/.test(key.toString('utf8'))) {
        throw new ReleaseGateError('APPLE_API_KEY_FORMAT_INVALID')
      }
      await writeFile(appleKeyPath, key, { mode: 0o600, flag: 'wx' })
    }
    await writeFile(configPath, JSON.stringify({ extends: join(rootDir, 'electron-builder.yml'), ...config }), { flag: 'wx' })
    phase = 'ELECTRON_BUILDER_FAILED'
    const build = await run(process.execPath, [join(rootDir, 'node_modules', 'electron-builder', 'cli.js'),
      `--${PLATFORM_NAMES[platform]}`, `--${arch}`, '--config', configPath, '--publish', 'never'], {
      cwd: rootDir, env: signingBuildEnvironment(env, mode, platform, appleKeyPath), timeoutMs: 1_800_000,
    })
    if (build.code !== 0) throw new ReleaseGateError('ELECTRON_BUILDER_FAILED')
    phase = 'SIGNING_VERIFICATION_FAILED'
    if (platform === 'win32') {
      report.checks = await verifyWindows({ executable: paths.application, installer: paths.installer, signed, rootDir, run })
    } else if (platform === 'darwin') {
      report.checks = await verifyMac({ application: paths.application, installer: paths.installer, signed, appleKeyPath, env, run })
      if (signed) await refreshMacBlockmap(paths.installer, run)
    }
    report.releaseCodeSigning = platform === 'linux' ? 'not-applicable' : signed ? 'verified' : 'not-configured'
    report.notarization = platform !== 'darwin' ? 'not-applicable' : signed ? 'verified' : 'not-configured'
    report.artifacts = [{ name: paths.installer.split(/[/\\]/).pop(), sha256: await fileHash(paths.installer) }]
    report.status = 'passed'
    await mkdir(dirname(paths.status), { recursive: true })
    await writeFile(paths.status, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    phase = 'RELEASE_ARTIFACT_STAGING_FAILED'
    await stageArtifacts({ rootDir, version, platform, arch, statusPath: paths.status })
    return { report, statusPath: paths.status }
  } catch (error) {
    report.status = 'failed'
    report.failureCode = error instanceof ReleaseGateError ? error.code : phase
    report.externalBlockers = error instanceof ReleaseGateError ? error.missing : []
    await mkdir(dirname(paths.status), { recursive: true })
    await writeFile(paths.status, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    // Never echo a caught builder/tool message because it can include credentials.
    throw new ReleaseGateError(report.failureCode, report.externalBlockers)
  } finally {
    if (temporary) {
      // Known individual files only; no recursive cleanup or user-controlled glob.
      for (const name of ['notarization.p8', 'builder.json']) {
        await unlink(join(temporary, name)).catch((error) => { if (error.code !== 'ENOENT') throw error })
      }
      await rmdir(temporary)
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { report } = await packageRelease({ rootDir: process.cwd(), mode: process.argv[2] })
    console.log(`Release package validated: ${report.platform}/${report.arch}; code signing ${report.releaseCodeSigning}; notarization ${report.notarization}.`)
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT,
      `version=${report.version}\narch=${report.arch}\n`, { flag: 'a' })
  } catch (error) {
    console.error(error instanceof ReleaseGateError ? error.message : 'RELEASE_PACKAGE_FAILED')
    process.exitCode = 1
  }
}
