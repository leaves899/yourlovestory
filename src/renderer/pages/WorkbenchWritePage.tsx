import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
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
import { FaCheck, FaPlay, FaRedo, FaStop, FaTimes } from 'react-icons/fa'
import { WorkbenchEmpty, WorkbenchError, WorkbenchPage, outlineStatusLabel, statusColor } from '../components/WorkbenchPrimitives'
import { createLlmConfig } from '../services/assistantService'
import { useAssistantStore, type AssistantLlmForm } from '../stores/assistantStore'
import { useTaskStore } from '../stores/taskStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

const defaultLlm: AssistantLlmForm = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
  contextBudget: '64000',
  maxOutputTokens: '4096',
}

function WorkbenchWritePage() {
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
    confirmVersion,
    rejectVersion,
  } = useTaskStore()
  const [chapterId, setChapterId] = useState('')
  const [autoConfirm, setAutoConfirm] = useState(false)
  const [llm, setLlm] = useState<AssistantLlmForm>(defaultLlm)

  useEffect(() => {
    if (!currentProject) return
    void load(currentProject.id)
    if (assistantProjectId !== currentProject.id) void initializeAssistant(currentProject.id)
  }, [assistantProjectId, currentProject, initializeAssistant, load])

  const selectedChapter = useMemo(() => chapterOutlines.find((chapter) => chapter.id === chapterId) ?? chapterOutlines[0] ?? null, [chapterId, chapterOutlines])

  useEffect(() => {
    if (selectedChapter) {
      setChapterId(selectedChapter.id)
      if (currentProject) void loadVersions(currentProject.id, selectedChapter.id)
    }
  }, [currentProject, loadVersions, selectedChapter])

  const start = async (): Promise<void> => {
    if (!currentProject || !selectedChapter || busy) return
    if (selectedChapter.status === 'draft') return
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
      autoConfirm,
      llm: createLlmConfig(llm),
    })
  }

  if (!currentProject) {
    return <WorkbenchPage eyebrow="WRITING" title="章节写作" description="选择章节大纲，提交生成任务并在审核前保留每一个流式检查点。"><Alert status="info"><AlertIcon />请先选择一个创作项目。</Alert></WorkbenchPage>
  }

  return (
    <WorkbenchPage eyebrow="WRITING PIPELINE" title="章节写作" description="生成需要已确认或已锁定的卷章大纲。任务会持续发送阶段、内容、检查点和审核事件，失败后可以从恢复入口继续。">
      <WorkbenchError message={error} />
      {chapterOutlines.length === 0 ? <WorkbenchEmpty title="还没有章节大纲" description="先在卷章大纲页创建并确认章节，再开始生成。" /> : <Stack spacing={5}>
        <Card>
          <CardBody>
            <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
              <Stack spacing={4}>
                <FormControl><FormLabel>目标章节</FormLabel><Select value={selectedChapter?.id ?? ''} onChange={(event) => setChapterId(event.target.value)}>{chapterOutlines.map((chapter) => <option key={chapter.id} value={chapter.id}>第 {chapter.chapter_number} 章 · {chapter.title} · {outlineStatusLabel(chapter.status)}</option>)}</Select></FormControl>
                {selectedChapter && <Alert status={selectedChapter.status === 'draft' ? 'warning' : 'info'}><AlertIcon /><Text>当前状态：{outlineStatusLabel(selectedChapter.status)}。{selectedChapter.status === 'draft' ? '确认大纲后才可以生成。' : '生成将使用当前版本，若版本发生变化会提示冲突。'}</Text></Alert>}
                <HStack><Checkbox isChecked={autoConfirm} onChange={(event) => setAutoConfirm(event.target.checked)} isDisabled={busy}>审核通过后自动确认</Checkbox><Text fontSize="sm" color="ink.500">建议首次生成关闭自动确认</Text></HStack>
                <HStack><Button colorScheme="cinnabar" leftIcon={<FaPlay />} onClick={() => void start()} isDisabled={busy || !selectedChapter || selectedChapter.status === 'draft'} data-testid="start-chapter-generation">{busy ? '生成中' : '开始生成'}</Button><Button variant="outline" leftIcon={<FaStop />} onClick={() => void cancel()} isDisabled={!busy}>取消任务</Button></HStack>
              </Stack>
              <Stack spacing={3}><Text fontWeight="bold">模型参数</Text><FormControl><FormLabel fontSize="sm">兼容接口</FormLabel><Input size="sm" value={llm.baseUrl} onChange={(event) => setLlm({ ...llm, baseUrl: event.target.value })} /></FormControl><FormControl><FormLabel fontSize="sm">模型</FormLabel><Input size="sm" value={llm.model} onChange={(event) => setLlm({ ...llm, model: event.target.value })} /></FormControl><FormControl><FormLabel fontSize="sm">API Key</FormLabel><Input size="sm" type="password" value={llm.apiKey} onChange={(event) => setLlm({ ...llm, apiKey: event.target.value })} /></FormControl></Stack>
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
          <CardBody>{versions.length === 0 ? <Text color="ink.500">生成完成后，章节版本会出现在这里。</Text> : <VStack align="stretch" spacing={3}>{versions.map((version) => <Card key={version.id} variant="outline"><CardBody><HStack align="flex-start" justify="space-between" gap={4}><Stack spacing={1}><HStack><Badge colorScheme={statusColor(version.status)}>{version.status}</Badge><Text fontWeight="bold">版本 {version.version_number}</Text></HStack><Text fontSize="sm" color="ink.600">{version.summary || '暂无摘要'}</Text><Text fontSize="xs" color={version.fact_check.passed ? 'green.600' : 'orange.600'}>{version.fact_check.passed ? '事实检查通过' : '事实检查需要复核'}</Text></Stack>{version.status === 'review' && <HStack flexShrink={0}><Button size="sm" leftIcon={<FaTimes />} variant="outline" onClick={() => void rejectVersion(currentProject.id, version.id)}>拒绝</Button><Button size="sm" leftIcon={<FaCheck />} colorScheme="cinnabar" onClick={() => void confirmVersion(currentProject.id, version.id)}>确认</Button></HStack>}</HStack></CardBody></Card>)}</VStack>}</CardBody>
        </Card>
      </Stack>}
    </WorkbenchPage>
  )
}

export default WorkbenchWritePage
