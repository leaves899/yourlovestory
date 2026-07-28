import type {
  ProjectPortabilityError,
  ProjectPortabilityErrorCode,
} from './types'

const MESSAGES: Record<ProjectPortabilityErrorCode, string> = {
  PROJECT_NOT_FOUND: '找不到要导出的项目。',
  PROJECT_EXPORT_FAILED: '项目导出失败，请稍后重试。',
  PROJECT_EXPORT_TOO_LARGE: '项目导出内容超过 50 MiB 限制。',
  PROJECT_IMPORT_INVALID: '项目文件无效或已损坏。',
  PROJECT_IMPORT_TOO_LARGE: '项目文件超过 50 MiB 限制。',
  PROJECT_IMPORT_UNSUPPORTED_VERSION: '暂不支持此项目文件版本。',
  PROJECT_IMPORT_CHECKSUM_MISMATCH: '项目文件完整性校验失败。',
  PROJECT_IMPORT_EXPIRED: '导入预览已过期，请重新选择文件。',
  PROJECT_IMPORT_ALREADY_USED: '此导入预览已使用或已取消。',
  PROJECT_IMPORT_CONFLICT: '项目文件包含重复或冲突的数据。',
  PROJECT_IMPORT_LIMIT_REACHED: '待处理的项目导入过多，请先完成或取消已有导入。',
  PROJECT_IMPORT_FAILED: '项目导入失败，未写入任何内容。',
  DATABASE_RECOVERY_REQUIRED: '数据库需要恢复后才能导入或导出项目。',
  LOCAL_IO_ERROR: '无法安全读取或保存项目文件。',
}

export class ProjectPortabilityException extends Error {
  public constructor(public readonly code: ProjectPortabilityErrorCode) {
    super(MESSAGES[code])
    this.name = 'ProjectPortabilityException'
  }
}

export function portabilityError(code: ProjectPortabilityErrorCode): ProjectPortabilityException {
  return new ProjectPortabilityException(code)
}

export function toProjectPortabilityError(
  error: unknown,
  fallback: ProjectPortabilityErrorCode,
): ProjectPortabilityError {
  const code = error instanceof ProjectPortabilityException ? error.code : fallback
  return { code, message: MESSAGES[code] }
}
