import type { SqliteDatabase } from '../types'

interface CurrentProjectRow {
  current_project_id: string | null
}

export class CurrentProjectRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public getCurrentProjectId(): string | null {
    const row = this.database
      .prepare<CurrentProjectRow>('SELECT current_project_id FROM workbench_state WHERE id = 1')
      .get()
    return row?.current_project_id ?? null
  }

  public select(projectId: string): void {
    this.database
      .prepare(
        `UPDATE workbench_state
         SET current_project_id = ?, updated_at = ?
         WHERE id = 1`,
      )
      .run(projectId, new Date().toISOString())
  }

  public clear(): void {
    this.database
      .prepare(
        `UPDATE workbench_state
         SET current_project_id = NULL, updated_at = ?
         WHERE id = 1`,
      )
      .run(new Date().toISOString())
  }
}
