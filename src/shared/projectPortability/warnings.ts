import type {
  ProjectArchiveWarning,
  ProjectArchiveWarningCode,
} from './types'

const WARNING_ORDER: readonly ProjectArchiveWarningCode[] = [
  'legacy-crush-links-removed',
  'legacy-fragment-links-removed',
  'local-source-path-omitted',
  'credentials-excluded',
  'runtime-history-excluded',
]

export function projectArchiveWarningMessage(
  code: ProjectArchiveWarningCode,
  count: number,
): string {
  switch (code) {
    case 'legacy-crush-links-removed':
      return `已断开 ${count} 个旧 Crush 关联。`
    case 'legacy-fragment-links-removed':
      return `已断开 ${count} 个旧 Fragment 关联。`
    case 'local-source-path-omitted':
      return `已省略 ${count} 个不安全或不可移植的素材 URI，正文内容仍保留。`
    case 'credentials-excluded':
      return '模型凭据未导出。'
    case 'runtime-history-excluded':
      return '任务、对话和运行历史未导出。'
  }
}

export function canonicalizeProjectArchiveWarnings(
  warnings: readonly ProjectArchiveWarning[],
): ProjectArchiveWarning[] {
  const byCode = new Map<ProjectArchiveWarningCode, number>()
  for (const warning of warnings) {
    if (byCode.has(warning.code)) {
      throw new Error(`Duplicate project archive warning: ${warning.code}`)
    }
    byCode.set(warning.code, warning.count)
  }
  return WARNING_ORDER
    .filter((code) => byCode.has(code))
    .map((code) => {
      const count = byCode.get(code) ?? 0
      return { code, count, message: projectArchiveWarningMessage(code, count) }
    })
}
