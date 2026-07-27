import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const RELEASE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.([1-9]\d*))?$/
const SUPPORTED_VERSION_POLICY = '<!-- supported-version-policy: current-prerelease-only -->'

export function isValidSemVer(value) {
  if (typeof value !== 'string') return false
  const match = SEMVER_PATTERN.exec(value)
  if (!match) return false
  const prerelease = match[4]
  return !prerelease?.split('.').some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))
}

export function isValidReleaseVersion(value) {
  return isValidSemVer(value) && RELEASE_VERSION_PATTERN.test(value)
}

function mismatch(file, field, expected, actual, fix) {
  return `${file}: ${field} 应为 "${expected}"，实际为 "${String(actual)}"。修复：${fix}`
}

export function checkVersionState({
  packageJson,
  packageLock,
  securityText,
  changelogText,
  gitRef = '',
  gitTags = [],
}) {
  const errors = []
  const version = packageJson?.version

  if (!isValidSemVer(version)) {
    errors.push(`package.json: version 预期为合法 SemVer，实际为 "${String(version)}"。修复：运行 npm version <semver> --no-git-tag-version。`)
    return errors
  }
  if (!isValidReleaseVersion(version)) {
    errors.push(`package.json: version 预期为 X.Y.Z、X.Y.Z-alpha.N、X.Y.Z-beta.N 或 X.Y.Z-rc.N，且 N 从 1 开始；实际为 "${version}"。修复：按 docs/release/versioning.md 选择发布版本。`)
    return errors
  }

  if (packageLock?.version !== version) {
    errors.push(mismatch('package-lock.json', 'version', version, packageLock?.version, `运行 npm version ${version} --no-git-tag-version`))
  }
  if (packageLock?.packages?.['']?.version !== version) {
    errors.push(mismatch('package-lock.json', 'packages[""].version', version, packageLock?.packages?.['']?.version, `运行 npm version ${version} --no-git-tag-version`))
  }

  for (const tag of gitTags) {
    if (!tag.startsWith('v') || !isValidReleaseVersion(tag.slice(1))) {
      errors.push(`Git tag: "${tag}" 不符合 vX.Y.Z、vX.Y.Z-alpha.N、vX.Y.Z-beta.N 或 vX.Y.Z-rc.N。修复：删除或重建该本地标签，并按 docs/release/versioning.md 命名。`)
    }
  }

  if (gitRef.startsWith('refs/tags/')) {
    const tag = gitRef.slice('refs/tags/'.length)
    const expectedTag = `v${version}`
    if (tag !== expectedTag) {
      errors.push(mismatch('GitHub Actions ref', 'tag', expectedTag, tag, `为 package.json 中的版本创建 ${expectedTag} 标签`))
    }
  }

  if (typeof securityText !== 'string' || !securityText.includes(SUPPORTED_VERSION_POLICY)) {
    errors.push(`SECURITY.md: 预期包含 "${SUPPORTED_VERSION_POLICY}"，实际未找到。修复：保留该标记并更新支持表。`)
  }
  if (securityText?.includes('| 0.1.x')) {
    errors.push('SECURITY.md: 预期不声明已停止支持的 0.1.x，实际仍包含该支持行。修复：按 docs/release/versioning.md 更新支持表。')
  }
  if (typeof changelogText !== 'string' || !changelogText.includes(`## [${version}]`)) {
    errors.push(`CHANGELOG.md: 预期包含当前版本标题 "## [${version}]"，实际未找到。修复：为当前 package.json 版本添加初始记录。`)
  }

  return errors
}

async function readJson(path, label, errors) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    const reason = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? '文件不存在'
      : '不是可解析的 JSON'
    errors.push(`${label}: ${reason}。修复：恢复有效的 ${label}。`)
    return undefined
  }
}

async function readText(path, label, errors) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    errors.push(`${label}: 文件不存在或不可读。修复：恢复 ${label}。`)
    return undefined
  }
}

export async function loadVersionState(rootDir, { gitRef = '', gitTags = [] } = {}) {
  const errors = []
  const packageJson = await readJson(join(rootDir, 'package.json'), 'package.json', errors)
  const packageLock = await readJson(join(rootDir, 'package-lock.json'), 'package-lock.json', errors)
  const securityText = await readText(join(rootDir, 'SECURITY.md'), 'SECURITY.md', errors)
  const changelogText = await readText(join(rootDir, 'CHANGELOG.md'), 'CHANGELOG.md', errors)

  if (errors.length > 0) return { errors, state: undefined }
  return {
    errors,
    state: { packageJson, packageLock, securityText, changelogText, gitRef, gitTags },
  }
}
