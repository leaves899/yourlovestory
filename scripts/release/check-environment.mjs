import { validateSigningEnvironment } from './policy.mjs'

try {
  const repository = process.env.GITHUB_REPOSITORY
  if (repository !== 'leaves899/yourlovestory' || process.env.GITHUB_REF !== 'refs/heads/master') {
    throw new Error('PROTECTED_SIGNING_REPOSITORY_REQUIRED')
  }
  const response = await fetch(`https://api.github.com/repos/${repository}/environments/release-signing`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ''}`,
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error('SIGNING_ENVIRONMENT_UNAVAILABLE')
  validateSigningEnvironment(await response.json(), process.env.GITHUB_REF_PROTECTED === 'true')
  console.log('Protected release-signing environment verified.')
} catch {
  // No response body, token, environment reviewer identity or credential is logged.
  console.error('SIGNING_ENVIRONMENT_GATE_FAILED: configure the protected release-signing environment before signed builds.')
  process.exitCode = 1
}
