import type { ChapterOutline, Character, Relation, Volume, VolumeOutline } from '../novelProject'
import type {
  FirstChapterStepId,
  FirstChapterWorkflowInput,
  FirstChapterWorkflowSnapshot,
  FirstChapterWorkflowStep,
  WorkflowCheck,
} from './models'

interface StepDefinition {
  id: FirstChapterStepId
  title: string
  actionRoute: string
  actionLabel: string
}

const STEP_DEFINITIONS: readonly StepDefinition[] = [
  { id: 'project', title: '创建项目', actionRoute: '/workbench/first-chapter', actionLabel: '创建项目' },
  { id: 'concept', title: '填写故事概念', actionRoute: '/workbench/first-chapter', actionLabel: '补充概念' },
  { id: 'characters', title: '创建核心角色', actionRoute: '/workbench/first-chapter', actionLabel: '创建角色' },
  { id: 'relationship', title: '建立核心关系', actionRoute: '/workbench/first-chapter', actionLabel: '建立关系' },
  { id: 'worldview', title: '准备世界观', actionRoute: '/workbench/first-chapter', actionLabel: '生成草案' },
  { id: 'volume-outline', title: '确认第一卷大纲', actionRoute: '/workbench/outline', actionLabel: '审核卷纲' },
  { id: 'chapter-outline', title: '确认第一章大纲', actionRoute: '/workbench/outline', actionLabel: '审核章纲' },
  { id: 'generation', title: '生成第一章', actionRoute: '/workbench/write', actionLabel: '生成章节' },
  { id: 'review', title: '审阅并确认', actionRoute: '/workbench/review', actionLabel: '审阅章节' },
  { id: 'narrative-update', title: '审核叙事提案', actionRoute: '/workbench/memory', actionLabel: '审核提案' },
]

const PROTAGONIST_ROLES = new Set(['protagonist', '主角', '主人公'])

function nonBlank(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

export function selectFirstChapterVolume(
  volumes: Volume[],
  chapterOutlines: ChapterOutline[],
  targetChapterOutlineId?: string,
): Volume | null {
  const target = targetChapterOutlineId
    ? chapterOutlines.find((outline) => outline.id === targetChapterOutlineId)
    : null
  if (target) return volumes.find((volume) => volume.id === target.volume_id) ?? null
  return [...volumes].sort((left, right) =>
    left.volume_number - right.volume_number || left.sort_order - right.sort_order,
  )[0] ?? null
}

function volumeOutlineFor(
  volume: Volume | null,
  outlines: VolumeOutline[],
): VolumeOutline | null {
  if (!volume) return null
  return outlines.find((outline) => outline.volume_id === volume.id) ?? null
}

export function selectFirstChapterOutline(
  outlines: ChapterOutline[],
  volume: Volume | null,
  targetChapterOutlineId?: string,
): ChapterOutline | null {
  if (targetChapterOutlineId) {
    return outlines.find((outline) =>
      outline.id === targetChapterOutlineId &&
      (!volume || outline.volume_id === volume.id),
    ) ?? null
  }
  const candidates = volume
    ? outlines.filter((outline) => outline.volume_id === volume.id)
    : outlines
  return [...candidates].sort((left, right) =>
    left.chapter_number - right.chapter_number || left.sort_order - right.sort_order,
  )[0] ?? null
}

function protagonistOf(characters: Character[]): Character | null {
  return characters.find((character) => PROTAGONIST_ROLES.has(character.role.trim())) ?? null
}

function hasCoreRelation(
  protagonist: Character | null,
  characters: Character[],
  relations: Relation[],
): boolean {
  if (!protagonist) return false
  const characterIds = new Set(characters.map((character) => character.id))
  return relations.some((relation) => {
    if (
      relation.source_entity_type !== 'character' ||
      relation.target_entity_type !== 'character'
    ) return false
    const otherId = relation.source_entity_id === protagonist.id
      ? relation.target_entity_id
      : relation.target_entity_id === protagonist.id
        ? relation.source_entity_id
        : null
    return otherId !== null && otherId !== protagonist.id && characterIds.has(otherId)
  })
}

function check(
  id: string,
  severity: WorkflowCheck['severity'],
  title: string,
  message: string,
  actionLabel: string,
  actionRoute: string,
  autoFixKind?: WorkflowCheck['autoFixKind'],
): WorkflowCheck {
  return {
    id,
    severity,
    title,
    message,
    blocking: severity === 'error',
    actionLabel,
    actionRoute,
    autoFixKind,
  }
}

function collectBlockingChecks(
  input: FirstChapterWorkflowInput,
  protagonist: Character | null,
  volume: Volume | null,
  volumeOutline: VolumeOutline | null,
  chapterOutline: ChapterOutline | null,
): WorkflowCheck[] {
  const checks: WorkflowCheck[] = []
  if (!input.project) {
    return [check('project-missing', 'error', '没有当前项目', '先创建或选择一个创作项目。', '创建项目', '/workbench/first-chapter')]
  }
  if (input.project.status !== 'active') checks.push(check('project-inactive', 'error', '项目未启用', '归档项目不能启动章节生成，请先恢复为进行中。', '管理项目', '/workbench/projects'))
  if (!nonBlank(input.project.description)) checks.push(check('concept-missing', 'error', '缺少故事概念', '用一句话说明主角、目标和核心阻力。', '补充概念', '/workbench/first-chapter'))
  if (!protagonist) checks.push(check('protagonist-missing', 'error', '缺少主角', '创建角色并将角色值设为 protagonist 或主角。', '创建主角', '/workbench/first-chapter'))
  if (!hasCoreRelation(protagonist, input.characters, input.relations)) checks.push(check('core-relation-missing', 'error', '缺少主角的核心关系', '为主角与至少一名核心角色建立关系。', '建立关系', '/workbench/first-chapter'))
  if (input.worldviewEntries.length === 0) checks.push(check('worldview-missing', 'error', '缺少世界观条目', '创建一条可编辑的世界观草案。', '补充世界观', '/workbench/first-chapter'))
  if (!volume) checks.push(check('volume-missing', 'error', '缺少第一卷', '创建第一卷后才能组织章纲。', '创建第一卷草案', '/workbench/first-chapter', 'create-first-volume'))
  if (volume && !volumeOutline) checks.push(check('volume-outline-missing', 'error', '缺少第一卷大纲', '为第一卷创建可编辑的大纲草案。', '创建卷纲草案', '/workbench/first-chapter', 'create-first-volume'))
  if (volumeOutline?.status === 'draft') checks.push(check('volume-outline-draft', 'error', '第一卷大纲尚未确认', '审核内容后确认或锁定第一卷大纲。', '审核卷纲', '/workbench/outline'))
  if (!chapterOutline) checks.push(check('chapter-outline-missing', 'error', '缺少第一章大纲', '创建可编辑的第一章大纲草案。', '创建章纲草案', '/workbench/first-chapter', 'create-first-chapter-outline'))
  if (chapterOutline?.status === 'draft') checks.push(check('chapter-outline-draft', 'error', '第一章大纲尚未确认', '审核内容后确认或锁定第一章大纲。', '审核章纲', '/workbench/outline'))
  if (!input.modelCredentialConfigured) checks.push(check('credential-missing', 'error', '模型凭据未配置', '在项目配置中安全保存模型凭据。', '配置模型凭据', '/workbench/config'))
  if (!input.modelEndpointValid) checks.push(check('endpoint-invalid', 'error', '模型接口地址不安全或无效', '使用 HTTPS 地址，或仅在本机开发时使用回环 HTTP 地址。', '修复接口地址', '/workbench/config'))
  if (input.generationTaskRunning) checks.push(check('generation-running', 'error', '已有章节生成任务正在运行', '等待当前任务完成，或在写作页取消任务后重试。', '查看任务', '/workbench/write'))
  return checks
}

function collectAdvisoryChecks(
  input: FirstChapterWorkflowInput,
  chapterOutline: ChapterOutline | null,
): WorkflowCheck[] {
  const checks: WorkflowCheck[] = []
  if (!nonBlank(input.config?.genre)) checks.push(check('genre-missing', 'warning', '题材尚未填写', '题材有助于稳定章节风格，但不会阻止生成。', '补充题材', '/workbench/config'))
  if (!nonBlank(input.config?.tone)) checks.push(check('tone-missing', 'warning', '语气尚未填写', '语气有助于统一叙事声音，但不会阻止生成。', '补充语气', '/workbench/config'))
  const outlineFields: Array<[keyof Pick<ChapterOutline, 'purpose' | 'opening' | 'conflict'>, string]> = [
    ['purpose', '章节目的'],
    ['opening', '开场'],
    ['conflict', '冲突'],
  ]
  for (const [field, label] of outlineFields) {
    if (chapterOutline && !nonBlank(chapterOutline[field])) checks.push(check(`chapter-${field}-missing`, 'warning', `${label}尚未填写`, `补充${label}可提高生成稳定性。`, '编辑第一章大纲', '/workbench/outline'))
  }
  if (chapterOutline && chapterOutline.key_events.length === 0) checks.push(check('chapter-key-events-missing', 'warning', '关键事件尚未填写', '至少列出一个关键事件可减少章节偏航。', '编辑关键事件', '/workbench/outline'))
  if (chapterOutline && !nonBlank(chapterOutline.ending) && !nonBlank(chapterOutline.ending_hook)) checks.push(check('chapter-ending-missing', 'warning', '结尾或钩子尚未填写', '补充结尾方向或章节钩子可增强衔接。', '编辑章节结尾', '/workbench/outline'))
  if (input.sourceMaterials.length === 0) checks.push(check('materials-missing', 'suggestion', '还没有故事素材', '素材不是首章生成的硬性条件，可以稍后补充。', '添加故事素材', '/workbench/materials'))
  if (input.organizations.length === 0) checks.push(check('organizations-missing', 'suggestion', '还没有组织设定', '如果故事涉及阵营或机构，可以补充组织设定。', '添加组织设定', '/workbench/organizations'))
  if (input.factCheckFindings?.some((finding) => finding.severity === 'warning')) checks.push(check('fact-check-warning', 'warning', '事实核查需要复核', '审阅核查证据和修改建议后再确认版本。', '前往审阅', '/workbench/review'))
  for (const failure of input.narrativeProposalFailures ?? []) {
    const label = failure === 'memory' ? '记忆提案' : '伏笔提案'
    checks.push(check(`${failure}-proposal-failed`, 'warning', `${label}生成失败`, '章节已确认，不受影响。可在审阅中心重新生成提案。', '重新生成提案', '/workbench/review'))
  }
  return checks
}

function completedSteps(
  input: FirstChapterWorkflowInput,
  protagonist: Character | null,
  volume: Volume | null,
  volumeOutline: VolumeOutline | null,
  chapterOutline: ChapterOutline | null,
): Record<FirstChapterStepId, boolean> {
  const approvedVersion = input.chapterVersions.some((version) => version.status === 'approved')
  const reviewVersion = input.chapterVersions.some((version) => version.status === 'review')
  return {
    project: Boolean(input.project),
    concept: Boolean(input.project && nonBlank(input.project.description)),
    characters: Boolean(protagonist && input.characters.some((character) => character.id !== protagonist.id)),
    relationship: hasCoreRelation(protagonist, input.characters, input.relations),
    worldview: input.worldviewEntries.length > 0,
    'volume-outline': Boolean(volume && volumeOutline && volumeOutline.status !== 'draft'),
    'chapter-outline': Boolean(chapterOutline && chapterOutline.status !== 'draft'),
    generation: reviewVersion || approvedVersion,
    review: approvedVersion,
    'narrative-update': approvedVersion && (
      (input.memoryProposalCount ?? 0) > 0 || (input.foreshadowProposalCount ?? 0) > 0
    ),
  }
}

export function evaluateFirstChapterWorkflow(
  input: FirstChapterWorkflowInput,
): FirstChapterWorkflowSnapshot {
  const protagonist = protagonistOf(input.characters)
  const volume = selectFirstChapterVolume(
    input.volumes,
    input.chapterOutlines,
    input.targetChapterOutlineId,
  )
  const volumeOutline = volumeOutlineFor(volume, input.volumeOutlines)
  const chapterOutline = selectFirstChapterOutline(
    input.chapterOutlines,
    volume,
    input.targetChapterOutlineId,
  )
  const checks = [
    ...collectBlockingChecks(input, protagonist, volume, volumeOutline, chapterOutline),
    ...collectAdvisoryChecks(input, chapterOutline),
  ]
  const completion = completedSteps(input, protagonist, volume, volumeOutline, chapterOutline)
  const currentStepId = STEP_DEFINITIONS.find((step) => !completion[step.id])?.id
    ?? 'narrative-update'
  const steps: FirstChapterWorkflowStep[] = STEP_DEFINITIONS.map((step) => ({
    ...step,
    completed: completion[step.id],
    current: step.id === currentStepId,
  }))
  const completedStepCount = steps.filter((step) => step.completed).length
  const hasBlockingError = checks.some((item) => item.blocking)
  const reviewVersion = input.chapterVersions.find((version) => version.status === 'review')
  const reviewHasBlockingFinding = reviewVersion?.fact_check.findings.some(
    (finding) => finding.severity === 'error',
  ) ?? false

  return {
    steps,
    checks,
    completedStepCount,
    totalStepCount: steps.length,
    canGenerate: !hasBlockingError,
    canConfirmChapter: Boolean(
      reviewVersion &&
      input.project?.status === 'active' &&
      !reviewHasBlockingFinding,
    ),
  }
}
