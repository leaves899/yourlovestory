import { useEffect, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  HStack,
  IconButton,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react'
import { FaCheck, FaPaperPlane, FaPlus, FaStop, FaTimes } from 'react-icons/fa'
import { WorkbenchPage } from '../components/WorkbenchPrimitives'
import {
  inspectLlmEndpoint,
  LlmEndpointSecurityNotice,
} from '../components/LlmEndpointSecurityNotice'
import type { AssistantLlmForm } from '../stores/assistantStore'
import { useAssistantStore } from '../stores/assistantStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

const defaultForm: AssistantLlmForm = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  contextBudget: '64000',
  maxOutputTokens: '4096',
}

function WorkbenchAssistantPage() {
  const currentProject = useWorkbenchStore((state) => state.currentProject)
  const {
    sessions,
    activeSessionId,
    messages,
    streamingText,
    toolStatus,
    busy,
    error,
    confirmation,
    initialize,
    createSession,
    loadSession,
    sendPrompt,
    stop,
    confirm,
  } = useAssistantStore()
  const [input, setInput] = useState('')
  const [form, setForm] = useState<AssistantLlmForm>(defaultForm)
  const [credentialConfigured, setCredentialConfigured] = useState(false)
  const endpointSecurity = inspectLlmEndpoint(form.baseUrl)

  useEffect(() => {
    if (!currentProject) return
    void initialize(currentProject.id)
    void window.electronAPI.getLlmCredentialStatus({ scope: 'project', projectId: currentProject.id })
      .then((response) => setCredentialConfigured(response.success && response.data?.configured === true))
      .catch(() => setCredentialConfigured(false))
  }, [currentProject, initialize])

  const send = async (): Promise<void> => {
    if (!input.trim() || busy || !currentProject || !endpointSecurity.valid) return
    const prompt = input
    setInput('')
    await sendPrompt(prompt, form)
  }

  if (!currentProject) {
    return <WorkbenchPage eyebrow="AI ASSISTANT" title="AI 助手" description="请先选择一个创作项目。"><Alert status="info"><AlertIcon />请先在项目页创建或选择一个创作项目。</Alert></WorkbenchPage>
  }

  return (
    <WorkbenchPage eyebrow="AI ASSISTANT" title="AI 助手" description="凭据只在主进程使用系统安全存储，不会进入会话或 renderer 状态。">
      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4}>
        <Card minH={{ xl: '680px' }}>
          <CardHeader><HStack justify="space-between"><Text fontWeight="bold">会话</Text><IconButton aria-label="新建会话" size="sm" icon={<FaPlus />} onClick={() => void createSession('assistant')} /></HStack></CardHeader>
          <CardBody px={3}><VStack align="stretch" spacing={2}>{sessions.map((session) => <Button key={session.id} variant={session.id === activeSessionId ? 'solid' : 'ghost'} colorScheme={session.id === activeSessionId ? 'cinnabar' : 'ink'} justifyContent="flex-start" onClick={() => void loadSession(session.id)} isDisabled={session.status === 'archived'}><Stack align="flex-start" spacing={0}><Text noOfLines={1}>{session.title || '未命名会话'}</Text><Text fontSize="xs" opacity={0.7}>{session.session_type} · {session.status}</Text></Stack></Button>)}</VStack></CardBody>
        </Card>
        <Card minH={{ xl: '680px' }} display="flex" flexDirection="column">
          <CardHeader><HStack justify="space-between"><Box><Text fontWeight="bold">{sessions.find((session) => session.id === activeSessionId)?.title || '创作会话'}</Text><Text fontSize="sm" color="ink.500" mt={1}>{toolStatus || (busy ? 'Agent 正在思考' : '等待输入')}</Text></Box>{busy && <IconButton aria-label="停止" colorScheme="cinnabar" icon={<FaStop />} onClick={() => void stop()} />}</HStack></CardHeader>
          <CardBody display="flex" flexDirection="column" flex={1} minH={0}><VStack align="stretch" spacing={3} flex={1} overflowY="auto">{messages.length === 0 && !streamingText && <Text textAlign="center" color="ink.500" py={12}>可以从人物、场景、素材或一条待解决的矛盾开始。</Text>}{messages.map((message) => <Box key={message.id} alignSelf={message.role === 'user' ? 'flex-end' : 'flex-start'} maxW="92%" bg={message.role === 'user' ? 'cinnabar.50' : message.role === 'tool' ? 'bamboo.50' : 'paper.50'} p={3} borderRadius="8px"><Text fontSize="xs" color="ink.500" mb={1}>{message.role === 'user' ? '你' : message.role === 'tool' ? message.tool_name ?? '工具' : 'Agent'}</Text><Text whiteSpace="pre-wrap" lineHeight="1.7">{message.content || '工具返回了结构化结果。'}</Text></Box>)}{streamingText && <Box alignSelf="flex-start" maxW="92%" bg="paper.50" p={3} borderRadius="8px"><Text fontSize="xs" color="ink.500" mb={1}>Agent 正在输出</Text><Text whiteSpace="pre-wrap" lineHeight="1.7">{streamingText}</Text></Box>}</VStack><Divider my={4} /><HStack align="flex-end"><Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void send() }} placeholder="告诉 Agent 你要构思、整理或修改什么。" minH="90px" /><IconButton aria-label="发送提示" icon={<FaPaperPlane />} colorScheme="cinnabar" isDisabled={!input.trim() || busy || !activeSessionId || !endpointSecurity.valid} onClick={() => void send()} /></HStack><Text fontSize="xs" color="ink.500" mt={2}>Ctrl 或 Command 加 Enter 发送。涉及写入、确认或锁定的操作会显示确认卡。</Text></CardBody>
        </Card>
        <Card minH={{ xl: '680px' }}><CardHeader><Text fontWeight="bold">模型设置</Text></CardHeader><CardBody><Stack spacing={4}><FormField label="兼容接口" value={form.baseUrl} onChange={(value) => setForm({ ...form, baseUrl: value })} /><LlmEndpointSecurityNotice baseUrl={form.baseUrl} /><FormField label="模型" value={form.model} onChange={(value) => setForm({ ...form, model: value })} /><FormField label="上下文预算" value={form.contextBudget} onChange={(value) => setForm({ ...form, contextBudget: value })} /><FormField label="输出上限" value={form.maxOutputTokens} onChange={(value) => setForm({ ...form, maxOutputTokens: value })} /><Text fontSize="sm" color={credentialConfigured ? 'green.600' : 'orange.600'}>{credentialConfigured ? '项目凭据已安全保存。' : '使用全局安全凭据；可在项目配置中单独保存项目凭据。'}</Text></Stack></CardBody></Card>
      </SimpleGrid>
      {error && <Alert status="warning" mt={4}><AlertIcon />{error}</Alert>}
      {confirmation && <Card position="fixed" right={{ base: 4, md: 8 }} bottom={{ base: 4, md: 8 }} maxW="420px" zIndex={20} borderColor="cinnabar.300"><CardHeader><Text fontWeight="bold">Agent 请求确认</Text></CardHeader><CardBody><Text fontSize="sm">Agent 想调用「{confirmation.toolName}」执行写入操作。</Text><HStack justify="flex-end" mt={4}><Button size="sm" leftIcon={<FaTimes />} variant="outline" onClick={() => void confirm(false)}>拒绝</Button><Button size="sm" leftIcon={<FaCheck />} colorScheme="cinnabar" onClick={() => void confirm(true)}>允许</Button></HStack></CardBody></Card>}
    </WorkbenchPage>
  )
}

function FormField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Box><Text fontSize="sm" mb={1}>{label}</Text><Input size="sm" value={value} onChange={(event) => onChange(event.target.value)} /></Box>
}

export default WorkbenchAssistantPage
