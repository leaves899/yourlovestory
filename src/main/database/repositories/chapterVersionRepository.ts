import { randomUUID } from 'node:crypto'
import { ChapterVersionStatusTransitionError } from '../../../shared/novelProject'
import type {
  ChapterVersion,
  ChapterVersionStatus,
  CreateChapterVersionInput,
  FactCheckFinding,
  FactCheckFindingStatus,
  FactCheckReport,
  FactCheckSeverity,
} from '../../../shared/chapterGeneration'
import { parseJsonObject, stringifyJsonObject, type JsonObject } from '../json'
import type { SqliteDatabase } from '../types'

export type {
  ChapterVersion,
  ChapterVersionStatus,
  CreateChapterVersionInput,
  FactCheckFinding,
  FactCheckFindingStatus,
  FactCheckReport,
  FactCheckSeverity,
}

interface ChapterVersionRow {
  id: string
  chapter_id: string
  task_id: string | null
  version_number: number
  content: string
  summary: string
  fact_check_json: string
  status: string
  is_current: number
  created_at: string
  reviewed_at: string | null
  confirmed_at: string | null
}

const statuses: readonly ChapterVersionStatus[] = ['review', 'approved', 'rejected']
const findingStatuses: readonly FactCheckFindingStatus[] = [
  'supported',
  'unclear',
  'contradicted',
]
const severities: readonly FactCheckSeverity[] = ['info', 'warning', 'error']

function toFactCheck(value: JsonObject): FactCheckReport {
  if (typeof value.passed !== 'boolean' || typeof value.summary !== 'string') {
    throw new Error('Invalid chapter version fact check')
  }
  if (!Array.isArray(value.findings)) throw new Error('Invalid chapter version fact check findings')
  const findings: FactCheckFinding[] = value.findings.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('Invalid chapter version fact check finding')
    }
    const finding = item as Record<string, unknown>
    if (
      typeof finding.claim !== 'string' ||
      typeof finding.evidence !== 'string' ||
      !findingStatuses.includes(finding.status as FactCheckFindingStatus) ||
      !severities.includes(finding.severity as FactCheckSeverity)
    ) {
      throw new Error('Invalid chapter version fact check finding')
    }
    return {
      claim: finding.claim,
      evidence: finding.evidence,
      status: finding.status as FactCheckFindingStatus,
      severity: finding.severity as FactCheckSeverity,
      suggestion: typeof finding.suggestion === 'string' ? finding.suggestion : undefined,
    }
  })
  return { passed: value.passed, summary: value.summary, findings }
}

function toFactCheckJson(report: FactCheckReport): JsonObject {
  return {
    passed: report.passed,
    summary: report.summary,
    findings: report.findings.map((finding) => ({
      claim: finding.claim,
      status: finding.status,
      severity: finding.severity,
      evidence: finding.evidence,
      suggestion: finding.suggestion ?? null,
    })),
  }
}

function toVersion(row: ChapterVersionRow): ChapterVersion {
  if (!statuses.includes(row.status as ChapterVersionStatus)) {
    throw new Error(`Unknown chapter version status: ${row.status}`)
  }
  const factCheck = parseJsonObject(row.fact_check_json, 'chapter_version.fact_check')
  if (!factCheck) throw new Error('Chapter version fact check cannot be null')
  return {
    id: row.id,
    chapter_id: row.chapter_id,
    task_id: row.task_id,
    version_number: row.version_number,
    content: row.content,
    summary: row.summary,
    fact_check: toFactCheck(factCheck),
    status: row.status as ChapterVersionStatus,
    is_current: row.is_current === 1,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
    confirmed_at: row.confirmed_at,
  }
}

function now(): string {
  return new Date().toISOString()
}

export class ChapterVersionRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateChapterVersionInput): ChapterVersion {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    const insert = this.database.transaction(() => {
      const next = this.database
        .prepare<{ next_version: number }>(
          'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM chapter_versions WHERE chapter_id = ?',
        )
        .get(input.chapter_id)
      const versionNumber = next?.next_version ?? 1
      this.database
        .prepare(
          `INSERT INTO chapter_versions (
            id, chapter_id, task_id, version_number, content, summary, fact_check_json,
            status, is_current, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'review', 0, ?)`,
        )
        .run(
          id,
          input.chapter_id,
          input.task_id ?? null,
          versionNumber,
          input.content,
          input.summary,
          stringifyJsonObject(toFactCheckJson(input.fact_check)),
          timestamp,
        )
    })
    insert()
    const version = this.getById(id)
    if (!version) throw new Error('Chapter version was not created')
    return version
  }

  public getById(id: string): ChapterVersion | null {
    const row = this.database
      .prepare<ChapterVersionRow>('SELECT * FROM chapter_versions WHERE id = ?')
      .get(id)
    return row ? toVersion(row) : null
  }

  public getByTaskId(taskId: string): ChapterVersion | null {
    const row = this.database
      .prepare<ChapterVersionRow>('SELECT * FROM chapter_versions WHERE task_id = ?')
      .get(taskId)
    return row ? toVersion(row) : null
  }

  public listByChapter(chapterId: string): ChapterVersion[] {
    return this.database
      .prepare<ChapterVersionRow>(
        'SELECT * FROM chapter_versions WHERE chapter_id = ? ORDER BY version_number DESC, id',
      )
      .all(chapterId)
      .map(toVersion)
  }

  public setStatus(
    id: string,
    status: ChapterVersionStatus,
    expectedStatus?: ChapterVersionStatus,
  ): ChapterVersion | null {
    const current = this.getById(id)
    if (!current) return null
    if (expectedStatus !== undefined && current.status !== expectedStatus) {
      throw new ChapterVersionStatusTransitionError(id, current.status, status)
    }
    if (current.status === status) {
      throw new ChapterVersionStatusTransitionError(id, current.status, status)
    }
    const timestamp = now()
    const update = this.database.transaction(() => {
      if (status === 'approved') {
        this.database
          .prepare(
            'UPDATE chapter_versions SET is_current = 0 WHERE chapter_id = ?',
          )
          .run(current.chapter_id)
        this.database
          .prepare(
            `UPDATE chapter_versions
             SET status = 'approved', is_current = 1, reviewed_at = ?, confirmed_at = ?
             WHERE id = ? AND status = 'review'`,
          )
          .run(timestamp, timestamp, id)
      } else if (status === 'rejected') {
        this.database
          .prepare(
            `UPDATE chapter_versions
             SET status = 'rejected', reviewed_at = ?
             WHERE id = ? AND status = 'review'`,
          )
          .run(timestamp, id)
      } else {
        throw new ChapterVersionStatusTransitionError(id, current.status, status)
      }
    })
    update()
    const next = this.getById(id)
    if (!next || next.status !== status) {
      throw new ChapterVersionStatusTransitionError(id, current.status, status)
    }
    return next
  }
}
