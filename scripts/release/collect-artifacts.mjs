import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { CHECKSUM_FILE, generateChecksums } from '../lib/checksums.mjs'
import { isValidReleaseVersion } from '../lib/version-check.mjs'
import { artifactPaths, fileHash } from './artifacts.mjs'
import { validateSigningEvidence, validateSmokeEvidence } from './evidence.mjs'
import { RELEASE_MODES, ReleaseGateError } from './policy.mjs'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')
const platforms = { windows: 'win32', macos: 'darwin', linux: 'linux' }

/** Keep downloads separate until every platform and filename has been verified. */
export async function collectArtifacts({ sourceDir, targetDir, version, mode }) {
  if (!isValidReleaseVersion(version) || !version.includes('-') || !RELEASE_MODES.includes(mode)) {
    throw new ReleaseGateError('INVALID_RELEASE_COLLECTION_CONTEXT')
  }
  const downloads = await readdir(sourceDir, { withFileTypes: true })
  const expectedDirectories = Object.keys(platforms).map((name) => `release-files-${version}-${name}`)
  if (downloads.length !== 3 || downloads.some((entry) => !entry.isDirectory() || !expectedDirectories.includes(entry.name))) {
    throw new ReleaseGateError('RELEASE_PLATFORM_SET_NOT_VALID')
  }
  const files = new Map()
  for (const [label, platform] of Object.entries(platforms)) {
    const folder = join(sourceDir, `release-files-${version}-${label}`)
    const entries = await readdir(folder, { withFileTypes: true })
    if (entries.some((entry) => !entry.isFile())) throw new ReleaseGateError('RELEASE_ARTIFACT_TYPE_NOT_VALID')
    const names = entries.map((entry) => entry.name)
    const signingNames = names.filter((name) => name.startsWith('SIGNING-STATUS-'))
    if (signingNames.length !== 1) throw new ReleaseGateError('RELEASE_SIGNING_REPORT_MISSING')
    const report = JSON.parse(await readFile(join(folder, signingNames[0]), 'utf8'))
    const arch = report.arch
    if (!['x64', 'arm64'].includes(arch) || (platform !== 'darwin' && arch !== 'x64')) {
      throw new ReleaseGateError('UNSUPPORTED_RELEASE_PLATFORM')
    }
    const paths = artifactPaths('', version, platform, arch)
    const installerName = basename(paths.installer)
    const smokeName = `SMOKE-STATUS-${paths.key}.json`
    const suffix = platform === 'win32' ? '' : platform === 'darwin' ? '-mac' : '-linux'
    const channel = version.split('-')[1].split('.')[0]
    const manifests = [`${channel}${suffix}.yml`, `latest${suffix}.yml`]
    const allowed = [installerName, `${installerName}.blockmap`, basename(paths.status), smokeName, ...manifests]
    if (names.some((name) => !allowed.includes(name)) || !names.includes(installerName)
      || !names.includes(basename(paths.status)) || !names.includes(smokeName)) {
      throw new ReleaseGateError('RELEASE_ARTIFACT_SET_NOT_VALID')
    }
    const installerHash = await fileHash(join(folder, installerName))
    validateSigningEvidence(report, { version, platform, arch, mode, installerName, installerHash })
    const smoke = JSON.parse(await readFile(join(folder, smokeName), 'utf8'))
    validateSmokeEvidence(smoke, { version, platform, arch, publicReport: true })
    if (smoke.mode !== mode || smoke.installerSha256 !== installerHash) {
      throw new ReleaseGateError('RELEASE_SMOKE_ARTIFACT_MISMATCH')
    }
    for (const name of names) {
      if (files.has(name)) throw new ReleaseGateError('RELEASE_ARTIFACT_FILENAME_COLLISION')
      const path = join(folder, name)
      if (manifests.includes(name)) {
        const manifest = yaml.load(await readFile(path, 'utf8'))
        const sha512 = await fileHash(join(folder, installerName), 'sha512', 'base64')
        const size = (await stat(join(folder, installerName))).size
        if (manifest?.version !== version || !Array.isArray(manifest.files) || manifest.files.length === 0
          || manifest.files.some((file) => file.url !== installerName || file.sha512 !== sha512 || file.size !== size)
          || (manifest.path !== undefined && manifest.path !== installerName)
          || (manifest.sha512 !== undefined && manifest.sha512 !== sha512)
          || (manifest.sha2 !== undefined && manifest.sha2 !== installerHash)) {
          throw new ReleaseGateError('RELEASE_UPDATE_MANIFEST_MISMATCH')
        }
      }
      files.set(name, path)
    }
  }
  await mkdir(targetDir, { recursive: true })
  if ((await readdir(targetDir)).length !== 0) throw new ReleaseGateError('RELEASE_UPLOAD_DIRECTORY_NOT_EMPTY')
  for (const [name, path] of files) await copyFile(path, join(targetDir, name))
  const generated = await generateChecksums(targetDir)
  const lines = (await readFile(join(targetDir, CHECKSUM_FILE), 'utf8')).trim().split('\n')
  if (generated.files.length !== files.size || lines.length !== files.size) {
    throw new ReleaseGateError('RELEASE_CHECKSUM_SET_NOT_VALID')
  }
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line)
    if (!match || !files.has(match[2]) || await fileHash(join(targetDir, match[2])) !== match[1]) {
      throw new ReleaseGateError('RELEASE_CHECKSUM_NOT_VALID')
    }
  }
  return generated
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { version } = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'))
    const result = await collectArtifacts({ sourceDir: resolve(process.argv[2]), targetDir: resolve(process.argv[3]),
      version, mode: process.argv[4] })
    console.log(`Validated three packaged platforms and ${result.files.length} release files; checksums generated.`)
  } catch (error) {
    console.error(error instanceof ReleaseGateError ? error.message : 'RELEASE_ARTIFACT_COLLECTION_FAILED')
    process.exitCode = 1
  }
}
