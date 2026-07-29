import type { DiagnosticError, DiagnosticErrorCode } from './types'

const MESSAGES: Record<DiagnosticErrorCode, string> = {
  DIAGNOSTIC_EXPORT_FAILED: '诊断包导出失败，请稍后重试。',
  DIAGNOSTIC_EXPORT_TOO_LARGE: '诊断包超过 1 MiB 上限，未写出文件。',
  LOCAL_IO_ERROR: '无法安全保存诊断包，请重试。',
}

export class DiagnosticException extends Error {
  public constructor(public readonly code: DiagnosticErrorCode) {
    super(MESSAGES[code])
    this.name = 'DiagnosticException'
  }
}

export function diagnosticError(code: DiagnosticErrorCode): DiagnosticException {
  return new DiagnosticException(code)
}

export function toDiagnosticError(
  error: unknown,
  fallback: DiagnosticErrorCode,
): DiagnosticError {
  const code = error instanceof DiagnosticException ? error.code : fallback
  return { code, message: MESSAGES[code] }
}
