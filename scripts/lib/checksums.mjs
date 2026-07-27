import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat, writeFile } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'

export const CHECKSUM_FILE = 'SHA256SUMS.txt'

async function listFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(currentDir, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(rootDir, path))
    else if (entry.isFile() && entry.name !== CHECKSUM_FILE) files.push(path)
  }
  return files
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function generateChecksums(directory) {
  const rootDir = resolve(directory)
  let info
  try {
    info = await stat(rootDir)
  } catch {
    throw new Error(`Artifact directory does not exist: ${rootDir}`)
  }
  if (!info.isDirectory()) throw new Error(`Artifact path is not a directory: ${rootDir}`)

  const files = await listFiles(rootDir)
  const normalized = files
    .map((path) => ({ path, name: relative(rootDir, path).split(sep).join('/') }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))

  if (normalized.length === 0) throw new Error(`Artifact directory contains no files: ${rootDir}`)

  const lines = []
  for (const file of normalized) lines.push(`${await sha256(file.path)}  ${file.name}`)
  const outputPath = join(rootDir, CHECKSUM_FILE)
  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8')
  return { outputPath, files: normalized.map((file) => file.name), name: basename(outputPath) }
}
