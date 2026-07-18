import { randomUUID } from 'node:crypto'
import { NarrativeStatusTransitionError } from '../../../shared/narrativeWorkbench'
import type {
  CreateNarrativeMemoryInput,
  CreateNarrativeMemoryProposalInput,
  MemoryProposalStatus,
  NarrativeMemory,
  NarrativeMemoryProposal,
  NarrativeMemoryStatus,
  NarrativeMemoryType,
} from '../../../shared/narrativeWorkbench'
import { parseJsonObject, parseJsonStringArray, stringifyJsonObject, stringifyJsonStringArray } from '../json'
import type { JsonObject, SqliteDatabase } from '../index'

interface NarrativeMemoryRow {
  id: string
  project_id: string
  memory_type: string
  title: string
  content: string
  source_chapter_id: string | null
  source_version_id: string | null
  importance: number
  status: string
  evidence_json: string
  metadata_json: string
  created_at: string
  updated_at: string
}

interface NarrativeMemoryProposalRow {
  id: string
  project_id: string
  source_chapter_id: string | null
  source_version_id: string | null
  memory_type: string
  title: string
  content: string
  confidence: number
  status: string
  evidence_json: string
  metadata_json: string
  created_at: string
  updated_at: string
}

const memoryTypes: readonly NarrativeMemoryType[] = [
  'fact',
  'event',
  'relationship',
  'character',
  'worldview',
  'emotion',
  'theme',
  'custom',
]
const memoryStatuses: readonly NarrativeMemoryStatus[] = [
  'proposed',
  'approved',
  'rejected',
  'archived',
]
const proposalStatuses: readonly MemoryProposalStatus[] = ['proposed', 'approved', 'rejected']

function now(): string {
  return new Date().toISOString()
}

function toMemoryType(value: string): NarrativeMemoryType {
  return memoryTypes.includes(value as NarrativeMemoryType) ? value as NarrativeMemoryType : 'custom'
}

function toMemoryStatus(value: string): NarrativeMemoryStatus {
  if (!memoryStatuses.includes(value as NarrativeMemoryStatus)) {
    throw new Error(`Unknown narrative memory status: ${value}`)
  }
  return value as NarrativeMemoryStatus
}

function toProposalStatus(value: string): MemoryProposalStatus {
  if (!proposalStatuses.includes(value as MemoryProposalStatus)) {
    throw new Error(`Unknown narrative memory proposal status: ${value}`)
  }
  return value as MemoryProposalStatus
}

function toMemory(row: NarrativeMemoryRow): NarrativeMemory {
  const metadata = parseJsonObject(row.metadata_json, 'narrative_memory.metadata')
  if (!metadata) throw new Error('Narrative memory metadata cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    memory_type: toMemoryType(row.memory_type),
    title: row.title,
    content: row.content,
    source_chapter_id: row.source_chapter_id,
    source_version_id: row.source_version_id,
    importance: row.importance,
    status: toMemoryStatus(row.status),
    evidence: parseJsonStringArray(row.evidence_json, 'narrative_memory.evidence'),
    metadata: metadata as JsonObject,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function toProposal(row: NarrativeMemoryProposalRow): NarrativeMemoryProposal {
  const metadata = parseJsonObject(row.metadata_json, 'narrative_memory_proposal.metadata')
  if (!metadata) throw new Error('Narrative memory proposal metadata cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    source_chapter_id: row.source_chapter_id,
    source_version_id: row.source_version_id,
    memory_type: toMemoryType(row.memory_type),
    title: row.title,
    content: row.content,
    confidence: Math.min(1, Math.max(0, row.confidence)),
    status: toProposalStatus(row.status),
    evidence: parseJsonStringArray(row.evidence_json, 'narrative_memory_proposal.evidence'),
    metadata: metadata as JsonObject,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class NarrativeMemoryRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateNarrativeMemoryInput): NarrativeMemory {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO narrative_memories (
          id, project_id, memory_type, title, content, source_chapter_id, source_version_id,
          importance, status, evidence_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.memory_type,
        input.title,
        input.content ?? '',
        input.source_chapter_id ?? null,
        input.source_version_id ?? null,
        input.importance ?? 0,
        input.status ?? 'approved',
        stringifyJsonStringArray(input.evidence ?? []),
        stringifyJsonObject(input.metadata ?? {}),
        timestamp,
        timestamp,
      )
    const memory = this.getById(id)
    if (!memory) throw new Error('Narrative memory was not created')
    return memory
  }

  public getById(id: string): NarrativeMemory | null {
    const row = this.database
      .prepare<NarrativeMemoryRow>('SELECT * FROM narrative_memories WHERE id = ?')
      .get(id)
    return row ? toMemory(row) : null
  }

  public listByProject(projectId: string): NarrativeMemory[] {
    return this.database
      .prepare<NarrativeMemoryRow>(
        `SELECT * FROM narrative_memories
         WHERE project_id = ?
         ORDER BY importance DESC, created_at DESC, id`,
      )
      .all(projectId)
      .map(toMemory)
  }

  public createProposal(input: CreateNarrativeMemoryProposalInput): NarrativeMemoryProposal {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    const confidence = Math.min(1, Math.max(0, input.confidence ?? 0.5))
    this.database
      .prepare(
        `INSERT INTO narrative_memory_proposals (
          id, project_id, source_chapter_id, source_version_id, memory_type, title, content,
          confidence, evidence_json, status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.source_chapter_id ?? null,
        input.source_version_id ?? null,
        input.memory_type,
        input.title,
        input.content ?? '',
        confidence,
        stringifyJsonStringArray(input.evidence ?? []),
        stringifyJsonObject(input.metadata ?? {}),
        timestamp,
        timestamp,
      )
    const proposal = this.getProposalById(id)
    if (!proposal) throw new Error('Narrative memory proposal was not created')
    return proposal
  }

  public getProposalById(id: string): NarrativeMemoryProposal | null {
    const row = this.database
      .prepare<NarrativeMemoryProposalRow>('SELECT * FROM narrative_memory_proposals WHERE id = ?')
      .get(id)
    return row ? toProposal(row) : null
  }

  public listProposalsByProject(projectId: string): NarrativeMemoryProposal[] {
    return this.database
      .prepare<NarrativeMemoryProposalRow>(
        `SELECT * FROM narrative_memory_proposals
         WHERE project_id = ?
         ORDER BY created_at DESC, id`,
      )
      .all(projectId)
      .map(toProposal)
  }

  public listProposalsByChapter(
    projectId: string,
    chapterId: string,
  ): NarrativeMemoryProposal[] {
    return this.database
      .prepare<NarrativeMemoryProposalRow>(
        `SELECT * FROM narrative_memory_proposals
         WHERE project_id = ? AND source_chapter_id = ?
         ORDER BY created_at DESC, id`,
      )
      .all(projectId, chapterId)
      .map(toProposal)
  }

  public setProposalStatus(
    id: string,
    status: MemoryProposalStatus,
  ): NarrativeMemoryProposal | null {
    const current = this.getProposalById(id)
    if (!current) return null
    if (current.status === status) return current
    if (current.status !== 'proposed') {
      throw new NarrativeStatusTransitionError('Narrative memory proposal', id, current.status, status)
    }
    const result = this.database
      .prepare(
        'UPDATE narrative_memory_proposals SET status = ?, updated_at = ? WHERE id = ? AND status = ?',
      )
      .run(status, now(), id, 'proposed')
    if (result.changes === 0) return this.getProposalById(id)
    return this.getProposalById(id)
  }

  public approveProposal(id: string): NarrativeMemory | null {
    const proposal = this.getProposalById(id)
    if (!proposal) return null
    if (proposal.status !== 'proposed') {
      throw new NarrativeStatusTransitionError(
        'Narrative memory proposal',
        id,
        proposal.status,
        'approved',
      )
    }
    const memoryId = randomUUID()
    const timestamp = now()
    const approve = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO narrative_memories (
            id, project_id, memory_type, title, content, source_chapter_id, source_version_id,
            importance, status, evidence_json, metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)`,
        )
        .run(
          memoryId,
          proposal.project_id,
          proposal.memory_type,
          proposal.title,
          proposal.content,
          proposal.source_chapter_id,
          proposal.source_version_id,
          Math.round(proposal.confidence * 100),
          stringifyJsonStringArray(proposal.evidence),
          stringifyJsonObject({ ...proposal.metadata, proposal_id: proposal.id }),
          timestamp,
          timestamp,
        )
      this.database
        .prepare(
          'UPDATE narrative_memory_proposals SET status = ?, updated_at = ? WHERE id = ? AND status = ?',
        )
        .run('approved', timestamp, id, 'proposed')
    })
    approve()
    return this.getById(memoryId)
  }
}

export type {
  CreateNarrativeMemoryInput,
  CreateNarrativeMemoryProposalInput,
  MemoryProposalStatus,
  NarrativeMemory,
  NarrativeMemoryProposal,
}
