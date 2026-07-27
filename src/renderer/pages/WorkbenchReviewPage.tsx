import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Button,
  Card,
  CardBody,
  HStack,
  Select,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import type { ChapterVersion } from '../../shared/chapterGeneration'
import { ChapterVersionReview } from '../components/ChapterVersionReview'
import { WorkflowCheckList } from '../components/WorkflowCheckList'
import { WorkbenchEmpty, WorkbenchError, WorkbenchPage } from '../components/WorkbenchPrimitives'
import { useFirstChapterWorkflow } from '../hooks/useFirstChapterWorkflow'
import narrativeService from '../services/narrativeService'
import taskService from '../services/taskService'
import { useNarrativeStore } from '../stores/narrativeStore'
import { useTaskStore } from '../stores/taskStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

interface ProposalStatus {
  memory: 'idle' | 'running' | 'success' | 'failed'
  foreshadow: 'idle' | 'running' | 'success' | 'failed'
  memoryCount: number
  foreshadowCount: number
}

const initialProposalStatus: ProposalStatus = {
  memory: 'idle',
  foreshadow: 'idle',
  memoryCount: 0,
  foreshadowCount: 0,
}

function WorkbenchReviewPage() {
  const navigate = useNavigate()
  const currentProject = useWorkbenchStore((state) => state.currentProject)
  const tasks = useTaskStore((state) => state.tasks)
  const versions = useTaskStore((state) => state.versions)
  const loadTasks = useTaskStore((state) => state.load)
  const loadVersions = useTaskStore((state) => state.loadVersions)
  const narrativeLoad = useNarrativeStore((state) => state.load)
  const proposalFailures = useNarrativeStore((state) => state.proposalFailures)
  const setProposalFailures = useNarrativeStore((state) => state.setProposalFailures)
  const workflow = useFirstChapterWorkflow()
  const [chapterId, setChapterId] = useState('')
  const [busyAction, setBusyAction] = useState<'confirm' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus>(initialProposalStatus)
  const proposalOperationRef = useRef(false)
  const reviewOperationRef = useRef(false)

  const availableChapterIds = useMemo(() => [...new Set(
    tasks
      .filter((task) => task.task_type === 'chapter-generation')
      .map((task) => {
        if (task.chapter_id) return task.chapter_id
        return typeof task.result?.chapter_id === 'string' ? task.result.chapter_id : null
      })
      .filter((id): id is string => id !== null),
  )], [tasks])

  useEffect(() => {
    if (!currentProject) return
    setChapterId('')
    setProposalStatus(initialProposalStatus)
    void loadTasks(currentProject.id)
  }, [currentProject, loadTasks])

  useEffect(() => {
    const nextChapterId = chapterId || availableChapterIds[0]
    if (!currentProject || !nextChapterId) return
    if (!chapterId) setChapterId(nextChapterId)
    void loadVersions(currentProject.id, nextChapterId)
  }, [availableChapterIds, chapterId, currentProject, loadVersions])

  const generateProposals = async (version: ChapterVersion): Promise<void> => {
    if (!currentProject) return
    const projectId = currentProject.id
    if (proposalOperationRef.current) return
    proposalOperationRef.current = true
    setProposalStatus((current) => ({ ...current, memory: 'running', foreshadow: 'running' }))
    setError(null)
    try {
      const [memory, foreshadow] = await Promise.allSettled([
        narrativeService.extractMemories(
          projectId,
          version.chapter_id,
          undefined,
          version.id,
        ),
        narrativeService.suggestForeshadows(projectId, version.chapter_id),
      ])
      if (useWorkbenchStore.getState().currentProject?.id !== projectId) return
      const failures: Array<'memory' | 'foreshadow'> = []
      if (memory.status === 'rejected') failures.push('memory')
      if (foreshadow.status === 'rejected') failures.push('foreshadow')
      setProposalFailures(failures)
      setProposalStatus({
        memory: memory.status === 'fulfilled' ? 'success' : 'failed',
        foreshadow: foreshadow.status === 'fulfilled' ? 'success' : 'failed',
        memoryCount: memory.status === 'fulfilled' ? memory.value.proposals.length : 0,
        foreshadowCount: foreshadow.status === 'fulfilled' ? foreshadow.value.suggestions.length : 0,
      })
      await narrativeLoad(projectId)
    } finally {
      proposalOperationRef.current = false
    }
  }

  const confirm = async (version: ChapterVersion): Promise<void> => {
    if (!currentProject || reviewOperationRef.current) return
    reviewOperationRef.current = true
    const projectId = currentProject.id
    setBusyAction('confirm')
    setError(null)
    try {
      await taskService.confirmVersion(projectId, version.id)
      if (useWorkbenchStore.getState().currentProject?.id !== projectId) return
      await loadVersions(projectId, version.chapter_id)
      await generateProposals(version)
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : String(confirmError))
    } finally {
      reviewOperationRef.current = false
      setBusyAction(null)
    }
  }

  const reject = async (version: ChapterVersion): Promise<void> => {
    if (!currentProject || reviewOperationRef.current) return
    reviewOperationRef.current = true
    const projectId = currentProject.id
    setBusyAction('reject')
    setError(null)
    try {
      await taskService.rejectVersion(projectId, version.id)
      if (useWorkbenchStore.getState().currentProject?.id !== projectId) return
      await loadVersions(projectId, version.chapter_id)
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : String(rejectError))
    } finally {
      reviewOperationRef.current = false
      setBusyAction(null)
    }
  }

  const retryProposals = async (): Promise<void> => {
    const approved = versions.find((version) => version.status === 'approved')
    if (!approved || proposalOperationRef.current) return
    try {
      await generateProposals(approved)
    } catch (proposalError) {
      setError(proposalError instanceof Error ? proposalError.message : String(proposalError))
    }
  }

  const proposalRunning = proposalStatus.memory === 'running' || proposalStatus.foreshadow === 'running'
  const proposalFailed = proposalFailures.length > 0

  if (!currentProject) {
    return (
      <WorkbenchPage eyebrow="REVIEW" title="章节审阅" description="查看正文、摘要、事实核查和叙事更新提案。">
        <WorkbenchEmpty
          title="还没有当前项目"
          description="先创建或选择项目，生成章节版本后即可在这里审阅。"
          actionLabel="返回黄金路径"
          onAction={() => navigate('/workbench/first-chapter')}
          secondaryActionLabel="普通项目管理"
          onSecondaryAction={() => navigate('/workbench/projects')}
        />
      </WorkbenchPage>
    )
  }

  return (
    <WorkbenchPage eyebrow="REVIEW CENTER" title="章节审阅" description="章节确认是主操作，记忆与伏笔提案在确认成功后独立生成。">
      <Stack spacing={5}>
        <WorkbenchError message={error} />
        <WorkflowCheckList checks={workflow.checks.filter((check) => check.id.startsWith('fact-check') || check.id.endsWith('proposal-failed'))} />
        {availableChapterIds.length > 0 && (
          <Select value={chapterId} onChange={(event) => setChapterId(event.target.value)} maxW="420px" data-testid="review-chapter-select">
            {availableChapterIds.map((id, index) => <option key={id} value={id}>已生成章节 {index + 1}</option>)}
          </Select>
        )}
        {versions.length === 0 ? (
          <WorkbenchEmpty
            title="还没有可审阅版本"
            description="章节生成完成后，review 版本会出现在这里。"
            actionLabel="前往章节生成"
            onAction={() => navigate('/workbench/write')}
            secondaryActionLabel="返回黄金路径"
            onSecondaryAction={() => navigate('/workbench/first-chapter')}
          />
        ) : versions.map((version) => (
          <ChapterVersionReview
            key={version.id}
            version={version}
            busyAction={busyAction}
            onConfirm={(item) => void confirm(item)}
            onReject={(item) => void reject(item)}
            onRevise={() => navigate('/workbench/revisions')}
          />
        ))}

        {(proposalStatus.memory !== 'idle' || proposalStatus.foreshadow !== 'idle' || proposalFailed) && (
          <Card data-testid="narrative-proposal-status">
            <CardBody>
              <Stack spacing={3}>
                <Alert status={proposalRunning ? 'info' : proposalFailed ? 'warning' : 'success'}>
                  <AlertIcon />
                  <Text>
                    {proposalRunning
                      ? '章节已确认，正在生成记忆与伏笔提案。'
                      : `章节已确认。记忆提案 ${proposalStatus.memoryCount} 条，伏笔提案 ${proposalStatus.foreshadowCount} 条。任何提案失败都不会撤销章节确认。`}
                  </Text>
                </Alert>
                <HStack flexWrap="wrap">
                  {(proposalFailed || proposalRunning) && (
                    <Button
                      onClick={() => void retryProposals()}
                      isLoading={proposalRunning}
                      isDisabled={proposalRunning}
                      data-testid="retry-narrative-proposals"
                    >
                      重新生成提案
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => navigate('/workbench/memory')}>前往叙事记忆</Button>
                  <Button variant="outline" onClick={() => navigate('/workbench/foreshadow')}>前往伏笔管理</Button>
                  <Button variant="ghost" onClick={() => navigate('/workbench/revisions')}>返回章节修订</Button>
                </HStack>
              </Stack>
            </CardBody>
          </Card>
        )}
      </Stack>
    </WorkbenchPage>
  )
}

export default WorkbenchReviewPage
