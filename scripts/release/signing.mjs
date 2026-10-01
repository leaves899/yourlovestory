import { spawn } from 'node:child_process'
import { basename, join } from 'node:path'
import { createRequire } from 'node:module'
import { ReleaseGateError } from './policy.mjs'

/** Capture tool output for validation; never print command arguments or raw errors. */
export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeoutMs = 180_000, maxOutputBytes = 4_194_304, ...spawnOptions } = options
    const child = spawn(command, args, { ...spawnOptions, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let capturedBytes = 0
    const capture = (data, stream) => {
      capturedBytes += data.length
      if (capturedBytes > maxOutputBytes) {
        clearTimeout(timer)
        child.kill()
        reject(new ReleaseGateError('SIGNING_TOOL_OUTPUT_LIMIT'))
        return
      }
      if (stream === 'stdout') stdout += data.toString()
      else stderr += data.toString()
    }
    child.stdout.on('data', (data) => capture(data, 'stdout'))
    child.stderr.on('data', (data) => capture(data, 'stderr'))
    const timer = setTimeout(() => { child.kill(); reject(new ReleaseGateError('SIGNING_TOOL_TIMEOUT')) }, timeoutMs)
    child.once('error', () => { clearTimeout(timer); reject(new ReleaseGateError('SIGNING_TOOL_UNAVAILABLE')) })
    child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}

async function checked(run, command, args, code, options) {
  const result = await run(command, args, options)
  if (result.code !== 0) throw new ReleaseGateError(code)
  return result
}

export async function verifyWindows({ executable, installer, signed, rootDir, run = runCommand }) {
  const checks = []
  for (const target of [executable, installer]) {
    const result = await checked(run, 'powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
      join(rootDir, 'scripts', 'release', 'verify-authenticode.ps1'), '-LiteralPath', target], 'WINDOWS_SIGNATURE_TOOL_FAILED')
    let signature
    try { signature = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim()) } catch {
      throw new ReleaseGateError('WINDOWS_SIGNATURE_STATUS_INVALID')
    }
    if (!['Valid', 'UnknownError', 'NotSigned', 'HashMismatch', 'NotTrusted', 'NotSupportedFileFormat', 'Incompatible']
      .includes(signature.status) || typeof signature.timestamped !== 'boolean'
      || (signature.signerSha256 !== null && !/^[a-f0-9]{64}$/.test(signature.signerSha256 ?? ''))) {
      throw new ReleaseGateError('WINDOWS_SIGNATURE_STATUS_INVALID')
    }
    if (signed && (signature.status !== 'Valid' || signature.timestamped !== true
      || !/^[a-f0-9]{64}$/.test(signature.signerSha256 ?? ''))) {
      throw new ReleaseGateError('WINDOWS_SIGNATURE_NOT_VALID')
    }
    checks.push({ check: 'authenticode', target: basename(target), status: signature.status,
      timestamped: signature.timestamped === true, signerSha256: signature.signerSha256 ?? null })
  }
  if (signed && checks[0].signerSha256 !== checks[1].signerSha256) {
    throw new ReleaseGateError('WINDOWS_SIGNER_MISMATCH')
  }
  return checks
}

/** Stapling changes DMG bytes, so the pre-stapling differential block map is stale. */
export async function refreshMacBlockmap(installer, run = runCommand) {
  const require = createRequire(import.meta.url)
  await checked(run, require('app-builder-bin').appBuilderPath,
    ['blockmap', '--input', installer, '--output', `${installer}.blockmap`], 'MAC_DMG_BLOCKMAP_REFRESH_FAILED')
}

export function parseMacSigningDetails(text) {
  return {
    developerId: /^Authority=Developer ID Application:/m.test(text),
    teamId: /^TeamIdentifier=(\w+)$/m.exec(text)?.[1] ?? null,
    hardenedRuntime: /^CodeDirectory.*flags=.*\bruntime\b/m.test(text),
  }
}

export async function verifyMac({ application, installer, signed, appleKeyPath, env, run = runCommand }) {
  const checks = []
  const details = await run('codesign', ['--display', '--verbose=4', application])
  const identity = parseMacSigningDetails(`${details.stdout}\n${details.stderr}`)
  if (!signed) {
    return [{ check: 'codesign-observation', target: basename(application),
      status: details.code === 0 ? (identity.developerId ? 'developer-id-present-unverified' : 'adhoc-or-vendor') : 'unsigned',
      notarization: 'not-requested' }]
  }
  if (details.code !== 0 || !identity.developerId || identity.teamId !== env.APPLE_TEAM_ID || !identity.hardenedRuntime) {
    throw new ReleaseGateError('MAC_SIGNING_IDENTITY_NOT_VALID')
  }
  await checked(run, 'codesign', ['--verify', '--deep', '--strict', application], 'MAC_APP_SIGNATURE_NOT_VALID')
  await checked(run, 'xcrun', ['stapler', 'validate', application], 'MAC_APP_NOTARIZATION_NOT_STAPLED')
  await checked(run, 'spctl', ['--assess', '--type', 'execute', '--verbose=4', application], 'MAC_APP_GATEKEEPER_REJECTED')
  checks.push({ check: 'developer-id-app-signature', target: basename(application), status: 'passed', hardenedRuntime: true })
  checks.push({ check: 'app-notarization-staple-and-gatekeeper', target: basename(application), status: 'passed' })
  // Validate and notarize the downloadable DMG, not only the app inside it.
  await checked(run, 'codesign', ['--verify', '--strict', installer], 'MAC_DMG_SIGNATURE_NOT_VALID')
  const dmgDetails = await checked(run, 'codesign', ['--display', '--verbose=4', installer], 'MAC_DMG_SIGNATURE_NOT_VALID')
  const dmgIdentity = parseMacSigningDetails(`${dmgDetails.stdout}\n${dmgDetails.stderr}`)
  if (!dmgIdentity.developerId || dmgIdentity.teamId !== env.APPLE_TEAM_ID) {
    throw new ReleaseGateError('MAC_DMG_SIGNER_MISMATCH')
  }
  const submitted = await checked(run, 'xcrun', ['notarytool', 'submit', installer,
    '--key', appleKeyPath, '--key-id', env.APPLE_API_KEY_ID, '--issuer', env.APPLE_API_ISSUER,
    '--wait', '--output-format', 'json'], 'MAC_DMG_NOTARIZATION_FAILED', { timeoutMs: 1_800_000 })
  let accepted
  try { accepted = JSON.parse(submitted.stdout) } catch { throw new ReleaseGateError('MAC_NOTARIZATION_STATUS_INVALID') }
  if (accepted.status !== 'Accepted') throw new ReleaseGateError('MAC_DMG_NOTARIZATION_NOT_ACCEPTED')
  await checked(run, 'xcrun', ['stapler', 'staple', installer], 'MAC_DMG_STAPLE_FAILED')
  await checked(run, 'xcrun', ['stapler', 'validate', installer], 'MAC_DMG_NOTARIZATION_NOT_STAPLED')
  await checked(run, 'spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature',
    '--verbose=4', installer], 'MAC_DMG_GATEKEEPER_REJECTED')
  checks.push({ check: 'developer-id-dmg-signature', target: basename(installer), status: 'passed' })
  checks.push({ check: 'dmg-notarization-staple-and-gatekeeper', target: basename(installer), status: 'passed' })
  return checks
}
