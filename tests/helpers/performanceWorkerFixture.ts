import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'

/** Compile the real Worker in isolation so Jest works in a clean checkout before build. */
export function compilePerformanceWorker(): { root: string; workerPath: string; dispose: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-compute-worker-'))
  const program = ts.createProgram([path.resolve('src/main/workers/computeWorker.ts')], {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    outDir: root, rootDir: path.resolve('src'), skipLibCheck: true, strict: true, esModuleInterop: true,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length > 0 || program.emit().emitSkipped) {
    fs.rmSync(root, { recursive: true, force: true })
    throw new Error(diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n') || 'Worker compilation failed')
  }
  return { root, workerPath: path.join(root, 'main/workers/computeWorker.js'),
    dispose: () => fs.rmSync(root, { recursive: true, force: true }) }
}
