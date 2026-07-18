import { useEffect } from 'react'
import { Alert, AlertIcon, Badge, Button, Card, CardBody, HStack, Stack, Text, VStack } from '@chakra-ui/react'
import { FaArchive } from 'react-icons/fa'
import { WorkbenchEmpty, WorkbenchPage, formatDate } from '../components/WorkbenchPrimitives'
import { useAssistantStore } from '../stores/assistantStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

function WorkbenchSessionsPage() {
  const project = useWorkbenchStore((state) => state.currentProject)
  const { sessions, activeSessionId, initialize, createSession, archiveSession, loadSession } = useAssistantStore()

  useEffect(() => {
    if (project) void initialize(project.id)
  }, [initialize, project])

  if (!project) return <WorkbenchPage eyebrow="SESSIONS" title="会话" description="管理当前项目的 Agent 会话。"><Alert status="info"><AlertIcon />请先选择一个项目。</Alert></WorkbenchPage>

  return <WorkbenchPage eyebrow="SESSIONS" title="会话" description="会话只属于当前项目。归档会停止运行中的 Agent，并保留本地消息记录。" actionLabel="新建助手会话" onAction={() => void createSession('assistant')}><Card>{sessions.length === 0 ? <CardBody><WorkbenchEmpty title="暂无会话" description="创建一个会话开始整理创作上下文。" /></CardBody> : <CardBody><VStack align="stretch" spacing={3}>{sessions.map((session) => <Card key={session.id} variant="outline"><CardBody><HStack justify="space-between" align="flex-start"><Stack><HStack><Text fontWeight="bold">{session.title || '未命名会话'}</Text>{session.id === activeSessionId && <Badge colorScheme="cinnabar">当前</Badge>}<Badge colorScheme={session.status === 'active' ? 'green' : 'gray'}>{session.status === 'active' ? '活跃' : '已归档'}</Badge></HStack><Text fontSize="sm" color="ink.600">类型：{session.session_type} · 创建于 {formatDate(session.created_at)}</Text></Stack><HStack><Button size="sm" variant="outline" onClick={() => void loadSession(session.id)}>打开</Button>{session.status === 'active' && <Button size="sm" variant="ghost" leftIcon={<FaArchive />} onClick={() => void archiveSession(session.id)}>归档</Button>}</HStack></HStack></CardBody></Card>)}</VStack></CardBody>}</Card></WorkbenchPage>
}

export default WorkbenchSessionsPage
