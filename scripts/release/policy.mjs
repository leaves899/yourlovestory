import { isValidReleaseVersion } from '../lib/version-check.mjs'

export const RELEASE_MODES = ['unsigned-prerelease', 'signed-prerelease']
export const SIGNING_ENVIRONMENT = 'release-signing'
export const PLATFORM_NAMES = { win32: 'win', darwin: 'mac', linux: 'linux' }
export const REQUIRED_SIGNING_INPUTS = {
  win32: ['WINDOWS_CSC_LINK', 'WINDOWS_CSC_KEY_PASSWORD'],
  darwin: ['MAC_CSC_LINK', 'MAC_CSC_KEY_PASSWORD', 'APPLE_API_KEY_BASE64',
    'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'APPLE_TEAM_ID'],
  linux: [],
}

export class ReleaseGateError extends Error {
  constructor(code, missing = []) {
    super(`${code}${missing.length ? `: ${missing.join(', ')}` : ''}`)
    this.name = 'ReleaseGateError'
    this.code = code
    this.missing = missing
  }
}

export function validateReleasePolicy({ mode, version, platform, arch, env }) {
  if (!RELEASE_MODES.includes(mode)) throw new ReleaseGateError('INVALID_RELEASE_MODE')
  if (!isValidReleaseVersion(version) || !version.includes('-')) {
    throw new ReleaseGateError('PUBLIC_STABLE_RELEASE_NOT_AUTHORIZED')
  }
  if (!(platform in PLATFORM_NAMES) || !['x64', 'arm64'].includes(arch)
    || (platform !== 'darwin' && arch !== 'x64')) throw new ReleaseGateError('UNSUPPORTED_RELEASE_PLATFORM')
  if (mode === 'signed-prerelease') {
    if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REF !== 'refs/heads/master'
      || env.GITHUB_REPOSITORY !== 'leaves899/yourlovestory'
      || env.GITHUB_REF_PROTECTED !== 'true' || env.RELEASE_SIGNING_ENVIRONMENT_VERIFIED !== 'true') {
      throw new ReleaseGateError('PROTECTED_SIGNING_CONTEXT_REQUIRED')
    }
    const missing = REQUIRED_SIGNING_INPUTS[platform].filter((key) => !env[key]?.trim())
    if (missing.length) throw new ReleaseGateError('SIGNING_INPUTS_MISSING', missing)
    if (platform === 'darwin' && !/^[A-Z0-9]{10}$/.test(env.APPLE_TEAM_ID)) {
      throw new ReleaseGateError('APPLE_TEAM_ID_INVALID')
    }
    if (platform === 'darwin' && (!/^[A-Z0-9]{10}$/.test(env.APPLE_API_KEY_ID)
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.APPLE_API_ISSUER))) {
      throw new ReleaseGateError('APPLE_API_KEY_IDENTITY_INVALID')
    }
  }
  const signed = mode === 'signed-prerelease'
  return {
    forceCodeSigning: signed && platform !== 'linux',
    win: { signAndEditExecutable: signed },
    mac: { hardenedRuntime: true, strictVerify: true, notarize: signed,
      ...(signed ? {} : { identity: null }) },
    dmg: { sign: signed },
  }
}

export function validateSigningEnvironment(environment, refProtected) {
  const rule = environment?.protection_rules?.find((item) => item.type === 'required_reviewers')
  if (environment?.name !== SIGNING_ENVIRONMENT || refProtected !== true
    || !rule?.reviewers?.length || rule.prevent_self_review !== true
    || environment.deployment_branch_policy?.protected_branches !== true
    || environment.deployment_branch_policy?.custom_branch_policies !== false) {
    throw new ReleaseGateError('SIGNING_ENVIRONMENT_PROTECTION_REQUIRED')
  }
}

/** Ambient credentials and debug settings never bleed into unsigned builds. */
export function signingBuildEnvironment(env, mode, platform, appleKeyPath) {
  const clean = { ...env }
  for (const key of Object.keys(clean)) {
    if (/^(?:CSC_|WIN_CSC_|MAC_CSC_|WINDOWS_CSC_|APPLE_)/.test(key)
      || ['DEBUG', 'ELECTRON_BUILDER_DEBUG', 'GH_TOKEN', 'GITHUB_TOKEN'].includes(key)) delete clean[key]
  }
  clean.CSC_IDENTITY_AUTO_DISCOVERY = mode === 'signed-prerelease' ? 'true' : 'false'
  if (mode === 'signed-prerelease' && platform !== 'linux') {
    const prefix = platform === 'win32' ? 'WINDOWS' : 'MAC'
    clean.CSC_LINK = env[`${prefix}_CSC_LINK`]
    clean.CSC_KEY_PASSWORD = env[`${prefix}_CSC_KEY_PASSWORD`]
    if (platform === 'darwin') {
      clean.APPLE_API_KEY = appleKeyPath
      clean.APPLE_API_KEY_ID = env.APPLE_API_KEY_ID
      clean.APPLE_API_ISSUER = env.APPLE_API_ISSUER
    }
  }
  return clean
}
