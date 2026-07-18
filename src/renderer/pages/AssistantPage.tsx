import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  HStack,
  Icon,
  IconButton,
  Input,
  Select,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react'
import {
  FaArchive,
  FaCheck,
  FaCog,
  FaPaperPlane,
  FaPlus,
  FaRobot,
  FaStop,
  FaTimes,
} from 'react-icons/fa'
import type { AssistantEvent } from '../../main/assistant'
import type { RendererChatMessage as ChatMessage, RendererChatSession as ChatSession } from '../types/assistant'
import type { Project } from '../../shared/novelProject'

interface LlmForm {
  baseUrl: string
  model: string
  apiKey: string
  contextBudget: string
  maxOutputTokens: string
}

interface ConfirmationRequest {
  requestId: string
  toolName: string
  args: Record<string, unknown>
}

const defaultLlm: LlmForm = {
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  apiKey: '',
  contextBudget: '64000',
  maxOutputTokens: '4096',
}

function messageLabel(message: ChatMessage): string {
  if (message.role === 'user') return '你'
  if (message.role === 'tool') return message.tool_name ?? '工具'
  return 'Agent'
}

function messageColor(message: ChatMessage): string {
  if (message.role === 'user') return 'cinnabar.50'
  if (message.role === 'tool') return 'bamboo.50'
  return 'paper.50'
}

function sessionTitle(session: ChatSession): string {
  return session.title.trim() || '未命名会话'
}

function parseNumber(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function AssistantPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionId, setSessionId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState<string>('')
  const [llm, setLlm] = useState<LlmForm>(defaultLlm)
  const [busy, setBusy] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [streamingText, setStreamingText] = useState<string>('')
  const [toolStatus, setToolStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null)
  const [newProjectName, setNewProjectName] = useState<string>('')
  const [newProjectSlug, setNewProjectSlug] = useState<string>('')

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessionId, sessions],
  )

  const loadSession = useCallback(async (nextSessionId: string): Promise<void> => {
    const response = await window.electronAPI.getAssistantSession(nextSessionId)
    if (response.success) {
      setSessionId(nextSessionId)
      setMessages(response.data.messages)
      setStreamingText('')
      setToolStatus('')
    }
  }, [])

  const loadSessions = useCallback(async (nextProjectId: string): Promise<void> => {
    if (!nextProjectId) {
      setSessions([])
      setSessionId('')
      setMessages([])
      return
    }
    const response = await window.electronAPI.listAssistantSessions(nextProjectId)
    if (!response.success) return
    let nextSessions = response.data
    if (nextSessions.length === 0) {
      const created = await window.electronAPI.createAssistantSession({
        projectId: nextProjectId,
        title: '创作助手',
        sessionType: 'assistant',
      })
      if (created.success) nextSessions = [created.data.session]
    }
    setSessions(nextSessions)
    const preferred = nextSessions.find((session) => session.status === 'active') ?? nextSessions[0]
    if (preferred) await loadSession(preferred.id)
  }, [loadSession])

  const loadProjects = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [listResponse, currentResponse] = await Promise.all([
        window.electronAPI.listNovelProjects(),
        window.electronAPI.getCurrentNovelProject(),
      ])
      const nextProjects = listResponse.success ? listResponse.data : []
      setProjects(nextProjects)
      const preferred = currentResponse.success && currentResponse.data
        ? currentResponse.data
        : nextProjects[0]
      if (preferred) {
        setProjectId(preferred.id)
        await loadSessions(preferred.id)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [loadSessions])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const unsubscribe = window.electronAPI.onAssistantEvent((event: AssistantEvent) => {
      if ('sessionId' in event && event.sessionId !== sessionId) return
      if (event.type === 'assistant:message') {
        setMessages((current) => current.some((item) => item.id === event.message.id)
          ? current
          : [...current, event.message])
        if (event.message.role === 'assistant') setStreamingText('')
        return
      }
      if (event.type === 'assistant:delta') {
        setStreamingText((current) => current + event.delta)
        return
      }
      if (event.type === 'assistant:tool:start') {
        setToolStatus(`正在使用 ${event.toolName}`)
        return
      }
      if (event.type === 'assistant:tool:update') return
      if (event.type === 'assistant:tool:end') {
        setToolStatus(event.isError ? `${event.toolName} 执行失败` : `${event.toolName} 已完成`)
        return
      }
      if (event.type === 'assistant:confirmation') {
        setConfirmation({
          requestId: event.requestId,
          toolName: event.toolName,
          args: event.args,
        })
        return
      }
      if (event.type === 'assistant:error') {
        setError(event.error)
        setBusy(false)
        return
      }
      if (event.type === 'assistant:end') {
        setBusy(false)
        setToolStatus('')
        if (event.status === 'error') setError(event.errorMessage ?? 'Agent 运行失败')
      }
    })
    return unsubscribe
  }, [sessionId])

  const selectProject = async (nextProjectId: string): Promise<void> => {
    setProjectId(nextProjectId)
    setError(null)
    try {
      await window.electronAPI.selectNovelProject({ project_id: nextProjectId })
      await loadSessions(nextProjectId)
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : String(selectError))
    }
  }

  const createProject = async (): Promise<void> => {
    if (!newProjectName.trim() || !newProjectSlug.trim()) {
      setError('请填写项目名称和 slug')
      return
    }
    try {
      const response = await window.electronAPI.createNovelProject({
        name: newProjectName.trim(),
        slug: newProjectSlug.trim(),
        select_after_create: true,
      })
      if (!response.success) return
      setNewProjectName('')
      setNewProjectSlug('')
      setProjects((current) => [...current, response.data])
      setProjectId(response.data.id)
      await loadSessions(response.data.id)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError))
    }
  }

  const createSession = async (): Promise<void> => {
    if (!projectId) return
    try {
      const response = await window.electronAPI.createAssistantSession({
        projectId,
        title: '新会话',
        sessionType: 'assistant',
      })
      if (!response.success) return
      setSessions((current) => [response.data.session, ...current])
      await loadSession(response.data.session.id)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError))
    }
  }

  const archiveSession = async (): Promise<void> => {
    if (!activeSession) return
    try {
      await window.electronAPI.archiveAssistantSession(activeSession.id)
      await loadSessions(projectId)
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : String(archiveError))
    }
  }

  const sendPrompt = async (): Promise<void> => {
    if (!sessionId || !input.trim() || busy) return
    if (!llm.model.trim()) {
      setError('请先填写模型名称')
      return
    }
    setBusy(true)
    setError(null)
    setStreamingText('')
    try {
      const response = await window.electronAPI.promptAssistant({
        sessionId: sessionId,
        prompt: input.trim(),
        llm: {
          baseUrl: llm.baseUrl,
          model: llm.model,
          apiKey: llm.apiKey || undefined,
          contextBudget: parseNumber(llm.contextBudget),
          maxOutputTokens: parseNumber(llm.maxOutputTokens),
          streamingEnabled: true,
        },
      })
      setInput('')
      if (response.success && response.data.status === 'error') {
        setError(response.data.errorMessage ?? 'Agent 运行失败')
      }
    } catch (promptError) {
      setError(promptError instanceof Error ? promptError.message : String(promptError))
      setBusy(false)
    }
  }

  const stopPrompt = async (): Promise<void> => {
    if (!sessionId) return
    await window.electronAPI.cancelAssistant(sessionId)
  }

  const resolveConfirmation = async (approved: boolean): Promise<void> => {
    if (!confirmation) return
    await window.electronAPI.confirmAssistantOperation(confirmation.requestId, approved)
    setConfirmation(null)
  }

  if (loading) {
    return (
      <Flex minH="70vh" align="center" justify="center">
        <VStack spacing={3}>
          <Spinner size="xl" color="cinnabar.500" />
          <Text color="ink.600">正在加载创作项目。</Text>
        </VStack>
      </Flex>
    )
  }

  if (projects.length === 0) {
    return (
      <Box maxW="760px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 8, md: 14 }}>
        <Card>
          <CardHeader>
            <HStack>
              <Icon as={FaRobot} color="cinnabar.500" />
              <Box>
                <Text fontSize="2xl" fontWeight="bold">开始一部本地长篇</Text>
                <Text color="ink.600" mt={1}>先创建项目，Agent 才能获得明确的创作边界和上下文。</Text>
              </Box>
            </HStack>
          </CardHeader>
          <CardBody>
            <Stack spacing={4}>
              {error && <Alert status="warning"><AlertIcon />{error}</Alert>}
              <FormControl>
                <FormLabel>项目名称</FormLabel>
                <Input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="例如：一段新的故事" />
              </FormControl>
              <FormControl>
                <FormLabel>项目 slug</FormLabel>
                <Input value={newProjectSlug} onChange={(event) => setNewProjectSlug(event.target.value)} placeholder="例如：new-story" />
              </FormControl>
              <Button leftIcon={<FaPlus />} colorScheme="cinnabar" onClick={() => void createProject()}>
                创建项目
              </Button>
            </Stack>
          </CardBody>
        </Card>
      </Box>
    )
  }

  return (
    <Box maxW="1440px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 5, md: 8 }}>
      <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} gap={4} mb={6} direction={{ base: 'column', md: 'row' }}>
        <HStack align="flex-start" spacing={3}>
          <Box w="42px" h="42px" borderRadius="10px" bg="cinnabar.500" color="paper.50" display="grid" placeItems="center" boxShadow="0 10px 24px rgba(159, 70, 53, 0.24)">
            <Icon as={FaRobot} />
          </Box>
          <Box>
            <Text fontSize="2xl" fontWeight="bold">Agent 创作助手</Text>
            <Text color="ink.600" mt={1}>读取项目上下文，协助构思、整理和推进长篇创作。</Text>
          </Box>
        </HStack>
        <HStack w={{ base: '100%', md: 'auto' }}>
          <Select value={projectId} onChange={(event) => void selectProject(event.target.value)} maxW="280px" variant="outline">
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </Select>
          <IconButton aria-label="创建新会话" icon={<FaPlus />} onClick={() => void createSession()} />
        </HStack>
      </Flex>

      {error && <Alert status="warning" mb={4}><AlertIcon />{error}</Alert>}

      <Grid templateColumns={{ base: '1fr', lg: '250px minmax(0, 1fr) 280px' }} gap={4} alignItems="stretch">
        <Card minH={{ lg: '680px' }}>
          <CardHeader>
            <Flex justify="space-between" align="center">
              <Text fontWeight="bold">会话</Text>
              <Badge colorScheme="bamboo">{sessions.length}</Badge>
            </Flex>
          </CardHeader>
          <CardBody px={3}>
            <VStack align="stretch" spacing={2}>
              {sessions.map((session) => (
                <Button
                  key={session.id}
                  variant={session.id === sessionId ? 'solid' : 'ghost'}
                  colorScheme={session.id === sessionId ? 'cinnabar' : 'ink'}
                  justifyContent="flex-start"
                  onClick={() => void loadSession(session.id)}
                  isDisabled={session.status === 'archived'}
                >
                  <VStack align="flex-start" spacing={0}>
                    <Text noOfLines={1}>{sessionTitle(session)}</Text>
                    <Text fontSize="xs" opacity={0.72}>{session.status === 'active' ? '进行中' : '已归档'}</Text>
                  </VStack>
                </Button>
              ))}
            </VStack>
          </CardBody>
        </Card>

        <Card minH={{ lg: '680px' }} display="flex" flexDirection="column">
          <CardHeader>
            <Flex justify="space-between" align="center" gap={3}>
              <Box>
                <Text fontWeight="bold">{activeSession ? sessionTitle(activeSession) : '创作会话'}</Text>
                <Text fontSize="sm" color="ink.500" mt={1}>{toolStatus || (busy ? 'Agent 正在思考' : '可以开始记录想法')}</Text>
              </Box>
              <HStack>
                {activeSession && <IconButton aria-label="归档会话" icon={<FaArchive />} variant="ghost" onClick={() => void archiveSession()} />}
                {busy && <IconButton aria-label="停止 Agent" icon={<FaStop />} colorScheme="cinnabar" onClick={() => void stopPrompt()} />}
              </HStack>
            </Flex>
          </CardHeader>
          <CardBody display="flex" flexDirection="column" flex={1} minH={0}>
            <VStack align="stretch" spacing={3} flex={1} overflowY="auto" pr={1}>
              {messages.length === 0 && !streamingText && (
                <Box py={14} textAlign="center" color="ink.500">
                  <Icon as={FaRobot} boxSize={8} color="cinnabar.300" mb={3} />
                  <Text>可以从一个人物、一个场景或一段素材开始。</Text>
                </Box>
              )}
              {messages.map((message) => (
                <Box key={message.id} bg={messageColor(message)} borderRadius="8px" p={3} maxW="92%" alignSelf={message.role === 'user' ? 'flex-end' : 'flex-start'} boxShadow="inkLine">
                  <Flex justify="space-between" gap={5} mb={1}>
                    <Text fontSize="xs" color="ink.500" fontWeight="bold">{messageLabel(message)}</Text>
                    <Text fontSize="xs" color="ink.400">{new Date(message.created_at).toLocaleTimeString()}</Text>
                  </Flex>
                  <Text whiteSpace="pre-wrap" lineHeight="1.75">{message.content || '工具已返回结构化结果。'}</Text>
                </Box>
              ))}
              {streamingText && (
                <Box bg="paper.50" borderRadius="8px" p={3} maxW="92%" boxShadow="inkLine">
                  <Text fontSize="xs" color="ink.500" fontWeight="bold" mb={1}>Agent 正在输出</Text>
                  <Text whiteSpace="pre-wrap" lineHeight="1.75">{streamingText}</Text>
                </Box>
              )}
            </VStack>
            <Divider my={4} />
            <HStack align="flex-end">
              <Textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="告诉 Agent 你想构思、整理或修改什么。" resize="vertical" minH="92px" onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void sendPrompt() }} />
              <IconButton aria-label="发送提示" icon={<FaPaperPlane />} colorScheme="cinnabar" isDisabled={!input.trim() || busy} onClick={() => void sendPrompt()} />
            </HStack>
            <Text fontSize="xs" color="ink.500" mt={2}>Ctrl 或 Command 加 Enter 发送。涉及写入、确认或锁定的操作会先请求确认。</Text>
          </CardBody>
        </Card>

        <Card minH={{ lg: '680px' }}>
          <CardHeader>
            <HStack><Icon as={FaCog} color="cinnabar.500" /><Text fontWeight="bold">模型设置</Text></HStack>
          </CardHeader>
          <CardBody>
            <Stack spacing={4}>
              <FormControl>
                <FormLabel>兼容接口地址</FormLabel>
                <Input value={llm.baseUrl} onChange={(event) => setLlm((current) => ({ ...current, baseUrl: event.target.value }))} />
              </FormControl>
              <FormControl>
                <FormLabel>模型名称</FormLabel>
                <Input value={llm.model} onChange={(event) => setLlm((current) => ({ ...current, model: event.target.value }))} placeholder="填写模型名称" />
              </FormControl>
              <FormControl>
                <FormLabel>API Key</FormLabel>
                <Input type="password" value={llm.apiKey} onChange={(event) => setLlm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="仅在当前运行中使用" />
              </FormControl>
              <SimpleGrid columns={2} spacing={3}>
                <FormControl>
                  <FormLabel>上下文预算</FormLabel>
                  <Input value={llm.contextBudget} onChange={(event) => setLlm((current) => ({ ...current, contextBudget: event.target.value }))} />
                </FormControl>
                <FormControl>
                  <FormLabel>输出上限</FormLabel>
                  <Input value={llm.maxOutputTokens} onChange={(event) => setLlm((current) => ({ ...current, maxOutputTokens: event.target.value }))} />
                </FormControl>
              </SimpleGrid>
              <Text fontSize="sm" color="ink.600">模型配置只保存在当前会话的非敏感字段中，API Key 不会写入会话配置。</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      {confirmation && (
        <Card position="fixed" right={{ base: 4, md: 8 }} bottom={{ base: 4, md: 8 }} maxW="420px" zIndex={10} borderColor="cinnabar.300">
          <CardHeader><Text fontWeight="bold">Agent 请求确认</Text></CardHeader>
          <CardBody>
            <Text fontSize="sm">Agent 想调用「{confirmation.toolName}」执行写入操作。请确认你是否允许。</Text>
            <HStack mt={4} justify="flex-end">
              <Button size="sm" leftIcon={<FaTimes />} variant="outline" onClick={() => void resolveConfirmation(false)}>拒绝</Button>
              <Button size="sm" leftIcon={<FaCheck />} colorScheme="cinnabar" onClick={() => void resolveConfirmation(true)}>允许</Button>
            </HStack>
          </CardBody>
        </Card>
      )}
    </Box>
  )
}

export default AssistantPage
