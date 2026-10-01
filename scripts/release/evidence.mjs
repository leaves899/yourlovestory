import { RELEASE_MODES, ReleaseGateError } from './policy.mjs'
import { isValidSemVer } from '../lib/version-check.mjs'

export const SMOKE_CHECKS = ['window', 'fileProtocol', 'preloadBridge', 'ipc', 'databaseReady',
  'projectCreated', 'persistedAfterRestart', 'gracefulExit']

export function validateSmokeEvidence(smoke, { version, platform, arch, publicReport = false }) {
  if (smoke?.schemaVersion !== 1 || smoke.status !== 'passed'
    || (publicReport ? smoke.version : smoke.appVersion) !== version
    || smoke.platform !== platform || smoke.arch !== arch || smoke.isPackaged !== true
    || smoke.nativeSqliteLoaded !== true || !isValidSemVer(smoke.electronVersion)
    || SMOKE_CHECKS.some((name) => smoke.checks?.[name] !== true)
    || Object.keys(smoke.checks ?? {}).length !== SMOKE_CHECKS.length
    || !Array.isArray(smoke.runs) || smoke.runs.length !== 2
    || smoke.runs.some((run, index) => run.run !== index + 1 || run.exitCode !== 0
      || run.crashed !== false || (!publicReport && run.exitSignal !== null))
    || (!publicReport && (!Array.isArray(smoke.errors) || smoke.errors.length !== 0))) {
    throw new ReleaseGateError('PACKAGED_RELEASE_EVIDENCE_NOT_VALID')
  }
}

export function validateSigningEvidence(report, { version, platform, arch, mode, installerName, installerHash }) {
  const signed = mode === 'signed-prerelease'
  const signingState = platform === 'linux' ? 'not-applicable' : signed ? 'verified' : 'not-configured'
  const notarizationState = platform !== 'darwin' ? 'not-applicable' : signed ? 'verified' : 'not-configured'
  if (!RELEASE_MODES.includes(mode) || report?.schemaVersion !== 1 || report.status !== 'passed' || report.version !== version
    || report.platform !== platform || report.arch !== arch || report.mode !== mode
    || report.releaseCodeSigning !== signingState || report.notarization !== notarizationState
    || report.failureCode !== null || !Array.isArray(report.externalBlockers) || report.externalBlockers.length !== 0
    || report.artifacts?.length !== 1 || report.artifacts[0].name !== installerName
    || report.artifacts[0].sha256 !== installerHash) {
    throw new ReleaseGateError('RELEASE_SIGNING_EVIDENCE_NOT_VALID')
  }
  if (signed && platform === 'win32') {
    const checks = report.checks
    if (checks?.length !== 2 || checks.some((check) => check.check !== 'authenticode'
      || check.status !== 'Valid' || check.timestamped !== true || !/^[a-f0-9]{64}$/.test(check.signerSha256 ?? ''))
      || checks[0].signerSha256 !== checks[1].signerSha256
      || !checks.some((check) => check.target === installerName)
      || !checks.some((check) => check.target === 'yourcrush.exe')) {
      throw new ReleaseGateError('WINDOWS_SIGNATURE_EVIDENCE_NOT_VALID')
    }
  }
  if (signed && platform === 'darwin') {
    const required = ['developer-id-app-signature', 'app-notarization-staple-and-gatekeeper',
      'developer-id-dmg-signature', 'dmg-notarization-staple-and-gatekeeper']
    if (report.checks?.length !== required.length
      || required.some((name) => !report.checks.some((check) => check.check === name && check.status === 'passed'
        && check.target === (name.startsWith('developer-id-app') || name.startsWith('app-notarization')
          ? 'yourcrush.app' : installerName)))
      || report.checks.find((check) => check.check === 'developer-id-app-signature')?.hardenedRuntime !== true) {
      throw new ReleaseGateError('MAC_SIGNATURE_EVIDENCE_NOT_VALID')
    }
  }
}
