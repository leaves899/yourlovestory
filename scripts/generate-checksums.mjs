import { generateChecksums } from './lib/checksums.mjs'

const directory = process.argv[2]
if (!directory) {
  console.error('Usage: npm run release:checksums -- <artifact-directory>')
  process.exitCode = 1
} else {
  try {
    const result = await generateChecksums(directory)
    console.log(`Generated ${result.name} for ${result.files.length} artifact(s): ${result.outputPath}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Checksum generation failed')
    process.exitCode = 1
  }
}
