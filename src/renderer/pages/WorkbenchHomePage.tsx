import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Grid,
  Heading,
  HStack,
  Link,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  VStack,
} from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'
import { FaArrowRight, FaBookOpen, FaFeatherAlt, FaLayerGroup, FaRobot } from 'react-icons/fa'
import { WorkbenchEmpty, WorkbenchPage } from '../components/WorkbenchPrimitives'
import { useTaskStore } from '../stores/taskStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

function WorkbenchHomePage() {
  const {
    currentProject,
    volumes,
    chapterOutlines,
    characters,
    sourceMaterials,
  } = useWorkbenchStore()
  const tasks = useTaskStore((state) => state.tasks)

  if (!currentProject) {
    return (
      <WorkbenchPage eyebrow="START HERE" title="创建你的第一部长篇" description="项目是工作台的边界。先建立项目，再逐步填充角色、世界观、素材和卷章结构。">
        <WorkbenchEmpty title="还没有当前项目" description="可以从项目页创建一个新项目。旧的 Fragment、Day 和 Crush 数据仍然保留在兼容入口中。" actionLabel="去创建项目" onAction={() => { window.location.hash = '#/workbench/projects' }} />
      </WorkbenchPage>
    )
  }

  const runningTasks = tasks.filter((task) => task.status === 'running' || task.status === 'pending').length
  const confirmedChapters = chapterOutlines.filter((outline) => outline.status !== 'draft').length

  return (
    <WorkbenchPage eyebrow="LONG-FORM WORKBENCH" title={currentProject.name} description={currentProject.description || '从项目设定到章节成稿，所有创作上下文都在同一个本地工作区中。'}>
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <StatCard label="卷" value={volumes.length} icon={<FaLayerGroup />} />
        <StatCard label="角色" value={characters.length} icon={<FaBookOpen />} />
        <StatCard label="已确认章节" value={`${confirmedChapters}/${chapterOutlines.length}`} icon={<FaFeatherAlt />} />
        <StatCard label="运行中任务" value={runningTasks} icon={<FaRobot />} />
      </SimpleGrid>

      <Grid templateColumns={{ base: '1fr', xl: '1.25fr 0.75fr' }} gap={5}>
        <Card>
          <CardHeader><Heading size="sm">继续创作</Heading></CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={3}>
              <ActionLink to="/workbench/outline" title="整理卷章大纲" description="把草稿推进到确认和锁定状态。" />
              <ActionLink to="/workbench/write" title="开始章节生成" description="查看流式内容、任务阶段和审核版本。" />
              <ActionLink to="/workbench/materials" title="补充故事素材" description={`${sourceMaterials.length} 条素材已在库中。`} />
              <ActionLink to="/workbench/assistant" title="打开 AI 助手" description="通过会话整理想法或触发受控写作任务。" />
            </VStack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><HStack justify="space-between"><Heading size="sm">项目边界</Heading><Badge colorScheme="bamboo">本地</Badge></HStack></CardHeader>
          <CardBody>
            <Text color="ink.600" lineHeight="1.8">生成任务只读取当前项目的稳定大纲、选定素材和叙事记忆。写入操作会经过版本校验，冲突时保留当前编辑内容并提示重新加载。</Text>
            <Link as={RouterLink} to="/workbench/config" color="cinnabar.600" display="inline-flex" alignItems="center" gap={2} mt={5}>调整项目配置 <FaArrowRight /></Link>
          </CardBody>
        </Card>
      </Grid>
    </WorkbenchPage>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return <Card><CardBody><HStack justify="space-between"><Stat><StatLabel>{label}</StatLabel><StatNumber mt={1}>{value}</StatNumber></Stat><Text color="cinnabar.500" fontSize="xl">{icon}</Text></HStack></CardBody></Card>
}

function ActionLink({ to, title, description }: { to: string; title: string; description: string }) {
  return <Link as={RouterLink} to={to} p={3} borderWidth="1px" borderColor="ink.200" borderRadius="6px" _hover={{ bg: 'paper.100', borderColor: 'cinnabar.300' }} textDecoration="none"><Text fontWeight="bold">{title}</Text><Text fontSize="sm" color="ink.600" mt={1}>{description}</Text></Link>
}

export default WorkbenchHomePage
