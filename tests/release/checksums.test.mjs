import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { CHECKSUM_FILE, generateChecksums } from '../../scripts/lib/checksums.mjs'

async function withTempDir(run) {
  const root = await mkdtemp(join(tmpdir(), 'yourcrush-checksums-'))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('generates stable sorted SHA-256 entries and supports spaces', async () => {
  await withTempDir(async (root) => {
    await mkdir(join(root, 'nested'))
    await writeFile(join(root, 'z artifact.bin'), 'z', 'utf8')
    await writeFile(join(root, 'nested', 'a.bin'), 'a', 'utf8')
    await writeFile(join(root, CHECKSUM_FILE), 'old checksum', 'utf8')

    const result = await generateChecksums(root)
    const lines = (await readFile(result.outputPath, 'utf8')).trim().split('\n')
    assert.deepEqual(result.files, ['nested/a.bin', 'z artifact.bin'])
    assert.equal(lines.length, 2)
    assert.equal(lines[0], 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb  nested/a.bin')
    assert.equal(lines[1], '594e519ae499312b29433b7dd8a97ff068defcba9755b6d5d00e84c524d67b06  z artifact.bin')
    assert.equal(lines.some((line) => line.includes(CHECKSUM_FILE)), false)
  })
})

test('fails for a missing directory', async () => {
  await assert.rejects(generateChecksums(join(tmpdir(), 'yourcrush-missing-artifacts')), /does not exist/)
})

test('fails for an empty directory', async () => {
  await withTempDir(async (root) => {
    await assert.rejects(generateChecksums(root), /contains no files/)
  })
})
