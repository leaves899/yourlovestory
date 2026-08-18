import { randomUUID } from 'node:crypto'
import type {
  CreatePostprocessReportInput,
  PostprocessReport,
  PostprocessReportStatus,
  PostprocessReportType,
} from '../../../shared/narrativeWorkbench'
import { parseJsonObject, stringifyJsonObject } from '../json'
import type { JsonObject } from '../json'
import type { SqliteDatabase } from '../types'

interface PostprocessReportRow {
  id: string
  project_id: string
  chapter_id: string | null
  task_id: string | null
  report_type: string
  status: string
  summary: string
  details_json: string
  created_at: string
}

const reportTypes: readonly PostprocessReportType[] = ['chapter-polish', 'paragraph-revision']
const reportStatuses: readonly PostprocessReportStatus[] = [
  'pending',
  'completed',
  'fallback',
  'failed',
]

function now(): string {
  return new Date().toISOString()
}

function toReport(row: PostprocessReportRow): PostprocessReport {
  if (!reportTypes.includes(row.report_type as PostprocessReportType)) {
    throw new Error(`Unknown postprocess report type: ${row.report_type}`)
  }
  if (!reportStatuses.includes(row.status as PostprocessReportStatus)) {
    throw new Error(`Unknown postprocess report status: ${row.status}`)
  }
  const details = parseJsonObject(row.details_json, 'postprocess_report.details')
  if (!details) throw new Error('Postprocess report details cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    chapter_id: row.chapter_id,
    task_id: row.task_id,
    report_type: row.report_type as PostprocessReportType,
    status: row.status as PostprocessReportStatus,
    summary: row.summary,
    details: details as JsonObject,
    created_at: row.created_at,
  }
}

export class PostprocessReportRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreatePostprocessReportInput): PostprocessReport {
    const id = input.id ?? randomUUID()
    this.database
      .prepare(
        `INSERT INTO postprocess_reports (
          id, project_id, chapter_id, task_id, report_type, status, summary, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.chapter_id ?? null,
        input.task_id ?? null,
        input.report_type,
        input.status,
        input.summary ?? '',
        stringifyJsonObject(input.details ?? {}),
        now(),
      )
    const report = this.getById(id)
    if (!report) throw new Error('Postprocess report was not created')
    return report
  }

  public getById(id: string): PostprocessReport | null {
    const row = this.database
      .prepare<PostprocessReportRow>('SELECT * FROM postprocess_reports WHERE id = ?')
      .get(id)
    return row ? toReport(row) : null
  }

  public getByTaskId(taskId: string): PostprocessReport | null {
    const row = this.database
      .prepare<PostprocessReportRow>('SELECT * FROM postprocess_reports WHERE task_id = ?')
      .get(taskId)
    return row ? toReport(row) : null
  }

  public listByChapter(projectId: string, chapterId: string): PostprocessReport[] {
    return this.database
      .prepare<PostprocessReportRow>(
        `SELECT * FROM postprocess_reports
         WHERE project_id = ? AND chapter_id = ?
         ORDER BY created_at DESC, id`,
      )
      .all(projectId, chapterId)
      .map(toReport)
  }
}

export type { CreatePostprocessReportInput, PostprocessReport }
