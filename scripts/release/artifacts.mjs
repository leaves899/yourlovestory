import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createRequire } from 'node:module'
import { PLATFORM_NAMES, ReleaseGateError } from './policy.mjs'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

export async function fileHash(path, algorithm = 'sha256', encoding = 'hex') {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest(encoding)
}

export function artifactPaths(rootDir, version, platform, arch) {
  const release = join(rootDir, 'release')
  const os = PLATFORM_NAMES[platform]
  const extension = { win32: 'exe', darwin: 'dmg', linux: 'AppImage' }[platform]
  const name = `yourcrush-${version}-${os}-${arch}.${extension}`
  const application = platform === 'win32' ? join(release, 'win-unpacked', 'yourcrush.exe')
    : platform === 'darwin' ? join(release, arch === 'arm64' ? 'mac-arm64' : 'mac', 'yourcrush.app')
      : join(release, 'linux-unpacked', 'yourcrush')
  return { installer: join(release, name), application, key: `${version}-${os}-${arch}`,
    status: join(release, 'signing', `SIGNING-STATUS-${version}-${os}-${arch}.json`), upload: join(release, 'upload') }
}

/** Refresh update hashes after DMG stapling; only the expected current artifact is accepted. */
export async function stageArtifacts({ rootDir, version, platform, arch, statusPath }) {
  const paths = artifactPaths(rootDir, version, platform, arch)
  const installerName = basename(paths.installer)
  const info = await stat(paths.installer)
  if (!info.isFile() || info.size === 0) throw new ReleaseGateError('RELEASE_INSTALLER_MISSING')
  const copies = [[paths.installer, installerName], [statusPath, basename(statusPath)]]
  const manifests = []
  const releaseDir = join(rootDir, 'release')
  const blockmap = `${installerName}.blockmap`
  const entries = await readdir(releaseDir)
  if (entries.includes(blockmap)) {
    copies.push([join(releaseDir, blockmap), blockmap])
  }
  const channel = version.split('-')[1].split('.')[0]
  const suffix = platform === 'win32' ? '' : platform === 'darwin' ? '-mac' : '-linux'
  for (const name of [`${channel}${suffix}.yml`, `latest${suffix}.yml`]) {
    if (!entries.includes(name)) continue
    const source = join(releaseDir, name)
    const manifest = yaml.load(await readFile(source, 'utf8'))
    if (manifest?.version !== version || !Array.isArray(manifest.files) || manifest.files.length === 0
      || manifest.files.some((file) => file.url !== installerName)
      || (manifest.path !== undefined && manifest.path !== installerName)) {
      throw new ReleaseGateError('RELEASE_UPDATE_MANIFEST_MISMATCH')
    }
    const sha512 = await fileHash(paths.installer, 'sha512', 'base64')
    manifest.files = manifest.files.map((file) => ({ ...file, sha512, size: info.size }))
    if (manifest.sha512 !== undefined) manifest.sha512 = sha512
    if (manifest.sha2 !== undefined) manifest.sha2 = await fileHash(paths.installer)
    manifests.push([name, yaml.dump(manifest)])
  }
  await mkdir(paths.upload, { recursive: true })
  if ((await readdir(paths.upload)).length !== 0) throw new ReleaseGateError('RELEASE_UPLOAD_DIRECTORY_NOT_EMPTY')
  for (const [source, name] of copies) await copyFile(source, join(paths.upload, name))
  for (const [name, contents] of manifests) await writeFile(join(paths.upload, name), contents, 'utf8')
  return [...copies.map(([, name]) => name), ...manifests.map(([name]) => name)]
}
