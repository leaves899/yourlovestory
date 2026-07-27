import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react'
import { FaPlay, FaRedo, FaStop } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import { WorkbenchEmpty, WorkbenchError, WorkbenchPage, outlineStatusLabel, statusColor } from '../components/WorkbenchPrimitives'
import { WorkflowCheckList } from '../components/WorkflowCheckList'
import { useFirstChapterWorkflow } from '../hooks/useFirstChapterWorkflow'
import {
  inspectLlmEndpoint,
  LlmEndpointSecurityNotice,
} from '../components/LlmEndpointSecurityNotice'
import { createLlmConfig } from '../services/assistantService'
import { useAssistantStore, type AssistantLlmForm } from '../stores/assistantStore'
import { useTaskStore } from '../stores/taskStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

const defaultLlm: AssistantLlmForm = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  contextBudget: '64000',
  maxOutputTokens: '4096',
}

function WorkbenchWritePage() {
  const navigate = useNavigate()
  const { currentProject, chapterOutlines } = useWorkbenchStore()
  const { activeSessionId, projectId: assistantProjectId, initialize: initializeAssistant, createSession } = useAssistantStore()
  const {
    tasks,
    recoverableTasks,
    versions,
    activeTaskId,
    stream,
    logs,
    busy,
    error,
    load,
    startGeneration,
    cancel,
    resume,
    loadVersions,
  } = useTaskStore()
  const [chapterId, setChapterId] = useState('')
  const [llm, setLlm] = useState<AssistantLlmForm>(defaultLlm)
  const endpointInputRef = useRef<HTMLInputElement>(null)
  const endpointSecurity = inspectLlmEndpoint(llm.baseUrl)

  useEffect(() => {
    if (!currentProject) return
    void load(currentProject.id)
    if (assistantProjectId !== currentProject.id) void initializeAssistant(currentProject.id)
  }, [assistantProjectId, currentProject, initializeAssistant, load])

  const selectedChapter = useMemo(() => chapterOutlines.find((chapter) => chapter.id === chapterId) ?? chapterOutlines[0] ?? null, [chapterId, chapterOutlines])
  const workflow = useFirstChapterWorkflow({
    endpointValid: endpointSecurity.valid,
    targetChapterOutlineId: selectedChapter?.id,
  })

  useEffect(() => {
    if (selectedChapter) {
      setChapterId(selectedChapter.id)
      if (currentProject) void loadVersions(currentProject.id, selectedChapter.id)
    }
  }, [currentProject, loadVersions, selectedChapter])

  const start = async (): Promise<void> => {
    if (!currentProject || !selectedChapter || busy || !workflow.canGenerate) return
    if (selectedChapter.status === 'draft') return
    if (!endpointSecurity.valid) return
    let sessionId = activeSessionId
    if (!sessionId || assistantProjectId !== currentProject.id) {
      await initializeAssistant(currentProject.id)
      sessionId = useAssistantStore.getState().activeSessionId
    }
    if (!sessionId) {
      await createSession('writer')
      sessionId = useAssistantStore.getState().activeSessionId
    }
    if (!sessionId) return
    await startGeneration({
      projectId: currentProject.id,
      sessionId,
      chapterOutlineId: selectedChapter.id,
      autoConfirm: false,
      llm: createLlmConfig(llm),
    })
  }

  if (!currentProject) {
    return <WorkbenchPage eyebrow="WRITING" title="章节写作" description="选择章节大纲，提交生成任务并在审核前保留每一个流式检查点。"><Alert status="info"><AlertIcon />请先选择一个创作项目。</Alert></WorkbenchPage>
  }

  return (
    <WorkbenchPage eyebrow="WRITING PIPELINE" title="章节写作" description="生成需要已确认或已锁定的卷章大纲。任务会持续发送阶段、内容、检查点和审核事件，失败后可以从恢复入口继续。">
      <WorkbenchError message={error} />
      <LlmEndpointSecurityNotice baseUrl={llm.baseUrl} />
      <Card mt={4} mb={4} data-testid="generation-preflight">
        <CardHeader><Text fontWeight="bold">生成前预检</Text></CardHeader>
        <CardBody>
          <WorkflowCheckList
            checks={workflow.checks}
            onAction={(check) => {
              if (check.id !== 'endpoint-invalid') return false
              endpointInputRef.current?.focus()
              return true
            }}
          />
        </CardBody>
      </Card>
      {chapterOutlines.length === 0 ? (
        <WorkbenchEmpty
          title="还没有章节大纲"
          description="先在卷章大纲页创建并确认章节，再开始生成。"
          actionLabel="前往卷章大纲"
          onAction={() => navigate('/workbench/outline')}
          secondaryActionLabel="返回黄金路径"
          onSecondaryAction={() => navigate('/workbench/first-chapter')}
        />
      ) : <Stack spacing={5}>
        <Card>
          <CardBody>
            <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
              <Stack spacing={4}>
                <FormControl><FormLabel>目标章节</FormLabel><Select value={selectedChapter?.id ?? ''} onChange={(event) => setChapterId(event.target.value)}>{chapterOutlines.map((chapter) => <option key={chapter.id} value={chapter.id}>第 {chapter.chapter_number} 章 · {chapter.title} · {outlineStatusLabel(chapter.status)}</option>)}</Select></FormControl>
                {selectedChapter && <Alert status={selectedChapter.status === 'draft' ? 'warning' : 'info'}><AlertIcon /><Text>当前状态：{outlineStatusLabel(selectedChapter.status)}。{selectedChapter.status === 'draft' ? '确认大纲后才可以生成。' : '生成将使用当前版本，若版本发生变化会提示冲突。'}</Text></Alert>}
                <Alert status={workflow.canGenerate ? 'success' : 'error'}><AlertIcon /><Text fontSize="sm">{workflow.canGenerate ? '预检通过，可以开始生成。生成结果仍需人工确认。' : '存在阻塞错误，请按上方恢复操作补齐条件。'}</Text></Alert>
                <HStack><Button colorScheme="cinnabar" leftIcon={<FaPlay />} onClick={() => void start()} isDisabled={busy || !selectedChapter || !workflow.canGenerate} data-testid="start-chapter-generation">{busy ? '生成中' : '开始生成'}</Button><Button variant="outline" leftIcon={<FaStop />} onClick={() => void cancel()} isDisabled={!busy}>取消任务</Button></HStack>
              </Stack>
              <Stack spacing={3}><Text fontWeight="bold">模型参数</Text><FormControl><FormLabel fontSize="sm">兼容接口</FormLabel><Input ref={endpointInputRef} size="sm" value={llm.baseUrl} onChange={(event) => setLlm({ ...llm, baseUrl: event.target.value })} /></FormControl><FormControl><FormLabel fontSize="sm">模型</FormLabel><Input size="sm" value={llm.model} onChange={(event) => setLlm({ ...llm, model: event.target.value })} /></FormControl><Text fontSize="sm" color="ink.600">API Key 由设置页的系统安全存储管理，不会进入任务、会话或 renderer 状态。</Text></Stack>
            </SimpleGrid>
          </CardBody>
        </Card>

        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
          <Card>
            <CardHeader><HStack justify="space-between"><Text fontWeight="bold">流式内容</Text>{activeTaskId && <Badge colorScheme="orange">任务 {activeTaskId.slice(0, 8)}</Badge>}</HStack></CardHeader>
            <CardBody><VStack align="stretch" spacing={3}><Progress value={activeTaskId ? (tasks.find((task) => task.id === activeTaskId)?.progress ?? 0) * 100 : 0} size="sm" colorScheme="cinnabar" /><Textarea value={stream || '任务开始后，生成内容会在这里逐步出现。'} readOnly minH="360px" whiteSpace="pre-wrap" fontFamily="body" /><Text fontSize="sm" color="ink.600">阶段：{tasks.find((task) => task.id === activeTaskId)?.stage ?? '未开始'}</Text></VStack></CardBody>
          </Card>
          <Card>
            <CardHeader><Text fontWeight="bold">任务日志与恢复</Text></CardHeader>
            <CardBody><VStack align="stretch" spacing={3}>{recoverableTasks.length > 0 && <Alert status="warning"><AlertIcon /><Text fontSize="sm">有 {recoverableTasks.length} 个任务可以恢复。</Text></Alert>}{recoverableTasks.map((task) => <HStack key={task.id} justify="space-between"><Text fontSize="sm" noOfLines={1}>{task.task_type} · {task.stage}</Text><Button size="xs" leftIcon={<FaRedo />} onClick={() => void resume(task.id)} isDisabled={busy}>恢复</Button></HStack>)}<Stack maxH="280px" overflowY="auto" spacing={1}>{logs.map((log, index) => <Text key={`${log}-${index}`} fontSize="xs" color="ink.600">{log}</Text>)}</Stack></VStack></CardBody>
          </Card>
        </SimpleGrid>

        <Card>
          <CardHeader><HStack justify="space-between"><Text fontWeight="bold">待审核版本</Text><Badge>{versions.length}</Badge></HStack></CardHeader>
          <CardBody>
            {versions.length === 0
              ? <Text color="ink.500">生成完成后，章节版本会出现在这里。</Text>
              : (
                <VStack align="stretch" spacing={3}>
                  {versions.map((version) => (
                    <Card key={version.id} variant="outline">
                      <CardBody>
                        <HStack align="flex-start" justify="space-between" gap={4}>
                          <Stack spacing={1}>
                            <HStack><Badge colorScheme={statusColor(version.status)}>{version.status}</Badge><Text fontWeight="bold">版本 {version.version_number}</Text></HStack>
                            <Text fontSize="sm" color="ink.600">{version.summary || '暂无摘要'}</Text>
                            <Text fontSize="xs" color={version.fact_check.passed ? 'green.600' : 'orange.600'}>{version.fact_check.passed ? '事实检查通过' : '事实检查需要复核'}</Text>
                          </Stack>
                          <Button size="sm" colorScheme="cinnabar" onClick={() => navigate('/workbench/review')}>
                            前往统一审阅
                          </Button>
                        </HStack>
                      </CardBody>
                    </Card>
                  ))}
                </VStack>
              )}
          </CardBody>
        </Card>
      </Stack>}
    </WorkbenchPage>
  )
}

export default WorkbenchWritePage
