import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, AlertIcon, Badge, Button, Card, CardBody, CardHeader, FormControl,
  FormLabel, HStack, Input, Progress, SimpleGrid, Stack, Text,
} from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { ContextCompilerPanel } from './ContextCompilerPanel'
import { outlineModelInput, readOutlineModelForm } from './projectOutlineModel'
import { WorkbenchError } from './WorkbenchPrimitives'
import { useAssistantStore } from '../stores/assistantStore'
import { taskVolumeOutlineId, useTaskStore } from '../stores/taskStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

interface OutlineGenerationPanelProps {
  outlineId?: string
  outlineStatus?: string
  dirty: boolean
}

export function OutlineGenerationPanel({ outlineId, outlineStatus, dirty }: OutlineGenerationPanelProps) {
  const navigate = useNavigate()
  const { currentProject, config, saving, saveConfig } = useWorkbenchStore()
  const taskStore = useTaskStore()
  const [debug, setDebug] = useState(false)
  const [form, setForm] = useState(() => readOutlineModelForm(config))
  const [modelDirty, setModelDirty] = useState(false)
  const modelDirtyRef = useRef(false)
  const modelProjectRef = useRef(currentProject?.id)
  const [configured, setConfigured] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const projectId = currentProject?.id
  const tasks = useMemo(() => taskStore.tasks.filter((task) => task.task_type === 'outline-generation'
    && taskVolumeOutlineId(task) === outlineId), [outlineId, taskStore.tasks])
  const recoveryTasks = taskStore.recoverableTasks.filter((task) => tasks.some((item) => item.id === task.id))
  const activeTask = tasks.find((task) => !recoveryTasks.some((recoverable) => recoverable.id === task.id)
    && (task.status === 'running' || task.status === 'pending'))
  const displayedTask = activeTask ?? tasks.find((task) => task.id === taskStore.activeTaskId) ?? tasks[0]
  const generationBlocked = dirty || modelDirty || submitting || saving || taskStore.busy || !configured
    || !outlineId || outlineStatus !== 'draft' || currentProject?.status !== 'active'
    || recoveryTasks.some((task) => task.status === 'running' || task.status === 'pending')

  useEffect(() => {
    if (modelProjectRef.current === projectId && modelDirtyRef.current) return
    modelProjectRef.current = projectId
    modelDirtyRef.current = false
    setForm(readOutlineModelForm(config))
    setModelDirty(false)
  }, [config, projectId])

  useEffect(() => {
    if (!projectId) return
    let disposed = false
    setConfigured(false)
    setDebug(false)
    setError(null)
    void taskStore.load(projectId)
    void window.electronAPI.getLlmCredentialStatus({ scope: 'project', projectId }).then((response) => {
      if (!disposed) setConfigured(response.success && response.data?.configured === true)
    }).catch(() => {
      if (!disposed) setError('无法读取当前项目的模型凭据状态。')
    })
    return () => { disposed = true }
  }, [projectId, config?.version, taskStore.load])

  const saveModel = async (): Promise<void> => {
    if (dirty || !config) return
    try {
      const llm = outlineModelInput(config, form)
      await saveConfig({
        context_budget: llm.contextBudget,
        settings: { ...config.settings, llmModel: llm.model, llmMaxOutputTokens: llm.maxOutputTokens ?? 4096, llmTemperature: llm.temperature ?? 0.7 },
      })
      modelDirtyRef.current = false
      setModelDirty(false)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '模型参数保存失败。')
    }
  }

  const start = async (): Promise<void> => {
    if (generationBlocked || !projectId || !outlineId) return
    setSubmitting(true)
    setError(null)
    try {
      const llm = outlineModelInput(config, form)
      const assistant = useAssistantStore.getState()
      if (assistant.projectId !== projectId) await assistant.initialize(projectId)
      if (!useAssistantStore.getState().activeSessionId) await useAssistantStore.getState().createSession('writer')
      const sessionId = useAssistantStore.getState().activeSessionId
      if (useWorkbenchStore.getState().currentProject?.id !== projectId || !sessionId) return
      await taskStore.startOutlineGeneration({
        taskType: 'outline-generation', projectId, sessionId, prompt: '生成卷大纲草稿', llm,
        input: { project_id: projectId, outline_id: outlineId, debug },
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '卷大纲生成失败。')
    } finally {
      setSubmitting(false)
    }
  }

  return <Stack spacing={4} data-testid="outline-generation-panel">
    <WorkbenchError message={error ?? taskStore.error} />
    <Card>
      <CardHeader><Text fontWeight="bold">生成卷大纲草稿</Text></CardHeader>
      <CardBody><Stack spacing={4}>
        <Text fontSize="sm" color="ink.600">生成使用当前项目模型凭据与统一上下文预算。结果保留为草稿，需要人工确认后才可用于章节生成。</Text>
        {(dirty || modelDirty || !outlineId || outlineStatus !== 'draft' || !configured) && <Alert status="warning" data-testid="outline-generation-preflight"><AlertIcon /><Text fontSize="sm">{dirty ? '请先保存卷大纲，本地未保存内容会保留。' : modelDirty ? '请先保存模型参数。' : !outlineId ? '请先保存卷大纲草稿。' : outlineStatus !== 'draft' ? '只有草稿卷大纲可以生成，请先解锁或创建新草稿。' : '当前项目尚未配置模型凭据，请前往项目配置。'}</Text></Alert>}
        <Text fontWeight="semibold">当前项目模型参数</Text>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
          {([
            ['model', '大纲模型'], ['contextBudget', '上下文预算'],
            ['maxOutputTokens', '输出 Token 上限'], ['temperature', '温度'],
          ] as const).map(([field, label]) => <FormControl key={field}><FormLabel htmlFor={`outline-model-${field}`} fontSize="sm">{label}</FormLabel><Input id={`outline-model-${field}`} size="sm" value={form[field]} isDisabled={submitting || taskStore.busy || saving} onChange={(event) => { modelDirtyRef.current = true; setForm({ ...form, [field]: event.target.value }); setModelDirty(true) }} /></FormControl>)}
        </SimpleGrid>
        <HStack flexWrap="wrap"><Button size="sm" variant="outline" isDisabled={dirty || !modelDirty || submitting || taskStore.busy || saving} onClick={() => void saveModel()}>保存模型参数</Button><Button size="sm" variant="link" onClick={() => navigate('/workbench/config')}>项目凭据设置</Button><Text fontSize="xs" color="ink.500">API Key 保存在主进程安全存储中。</Text></HStack>
        <HStack><Button colorScheme="cinnabar" isDisabled={generationBlocked} isLoading={submitting} data-testid="start-outline-generation" onClick={() => void start()}>生成卷大纲草稿</Button><Button variant="outline" isDisabled={!activeTask} data-testid="cancel-outline-generation" onClick={() => void taskStore.cancel(activeTask?.id)}>取消大纲任务</Button></HStack>
        {displayedTask && <Stack data-testid="outline-task-progress"><HStack><Badge>{displayedTask.status}</Badge><Text fontSize="sm">阶段：{displayedTask.stage}</Text></HStack><Progress value={displayedTask.progress * 100} size="sm" /><Text fontSize="sm" whiteSpace="pre-wrap">{displayedTask.id === taskStore.activeTaskId ? taskStore.stream : ''}</Text></Stack>}
        <Stack data-testid="outline-task-recovery">
          {recoveryTasks.map((task) => <Stack key={task.id} borderWidth="1px" borderRadius="md" p={3}><Badge alignSelf="flex-start">{task.recovery_classification}</Badge><Text fontSize="sm">{task.recovery_reason}</Text>{task.auto_allowed ? <Button size="sm" isDisabled={dirty || modelDirty || submitting || taskStore.busy} data-testid={`outline-resume-${task.id}`} onClick={() => void taskStore.resume(task.id)}>安全恢复大纲任务</Button> : task.manual_retry_allowed ? <Button size="sm" isDisabled={dirty || modelDirty || submitting || taskStore.busy} data-testid={`outline-retry-${task.id}`} onClick={() => { if (window.confirm('模型请求可能已执行。按当前项目凭据重试可能产生额外调用费用，是否继续？')) void taskStore.manualRetry(task.id) }}>确认重试大纲任务</Button> : <Text fontSize="sm">旧任务不可恢复，请保留当前草稿并重新生成。</Text>}</Stack>)}
        </Stack>
      </Stack></CardBody>
    </Card>
    <ContextCompilerPanel tasks={taskStore.tasks} activeTaskId={taskStore.activeTaskId} taskType="outline-generation" outlineId={outlineId} debug={debug} onDebugChange={setDebug} />
  </Stack>
}
