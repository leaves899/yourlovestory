import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

test('draft workflow gates secrets, keeps package credentials scoped and collects without overwrite', async () => {
  const workflow = yaml.load(await readFile(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'])
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.signing_mode.options, ['unsigned-prerelease', 'signed-prerelease'])
  assert.equal(workflow.permissions.contents, 'read')
  const jobs = workflow.jobs
  assert.equal(jobs.quality.steps.some((step) => step.uses === 'gitleaks/gitleaks-action@v2'), true)
  assert.equal(jobs.quality.steps.some((step) => step.run?.includes('check-environment.mjs')), true)
  assert.equal(jobs.package_unsigned.environment, undefined)
  assert.equal(jobs.package_signed.environment, 'release-signing')
  assert.equal(jobs.package_unsigned.steps.some((step) => JSON.stringify(step).includes('secrets.')), false)
  for (const job of [jobs.package_unsigned, jobs.package_signed]) {
    assert.equal(job.needs, 'quality')
    assert.equal(job.permissions?.contents === 'write', false)
    assert.equal(job.steps.some((step) => step.run === 'node scripts/release/finalize-platform.mjs'), true)
    assert.equal(job.steps.some((step) => step.uses === 'actions/upload-artifact@v4'
      && step.with.path === 'release/upload/**' && step.if === undefined), true)
  }
  assert.deepEqual(jobs['draft-release'].needs, ['quality', 'package_unsigned', 'package_signed'])
  assert.equal(jobs['draft-release'].if.includes('always()'), true)
  assert.equal(jobs['draft-release'].if.includes("needs.quality.result == 'success'"), true)
  assert.equal(jobs['draft-release'].permissions.contents, 'write')
  const download = jobs['draft-release'].steps.find((step) => step.uses === 'actions/download-artifact@v4')
  assert.equal(download.with['merge-multiple'], false)
  assert.equal(download.with.pattern.startsWith('release-files-'), true)
  const publish = jobs['draft-release'].steps.find((step) => step.run?.includes('gh release create'))
  assert.equal(publish.run.includes('--draft'), true)
  assert.equal(publish.run.includes('--prerelease'), true)
})

test('ordinary CI exercises real unsigned package, smoke binding and three-platform integrity without publishing', async () => {
  const workflow = yaml.load(await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'))
  assert.equal(workflow.permissions.contents, 'read')
  const packageJob = workflow.jobs['packaged-smoke']
  assert.equal(packageJob.steps.some((step) => step.run === 'node scripts/release/package.mjs unsigned-prerelease'), true)
  assert.equal(packageJob.steps.some((step) => step.run === 'node scripts/release/finalize-platform.mjs'), true)
  const integrity = workflow.jobs['release-integrity']
  assert.equal(integrity.needs, 'packaged-smoke')
  const download = integrity.steps.find((step) => step.uses === 'actions/download-artifact@v4')
  assert.equal(download.with['merge-multiple'], false)
  assert.equal(integrity.steps.some((step) => step.run?.includes('collect-artifacts.mjs')), true)
  assert.equal(JSON.stringify(workflow).includes('gh release create'), false)
  assert.equal(Object.values(workflow.jobs).some((job) => job.permissions?.contents === 'write'), false)
})
