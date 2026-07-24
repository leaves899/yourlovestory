import { useEffect } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Icon,
  Select,
  Spinner,
  Stack,
  Text,
  VStack,
} from '@chakra-ui/react'
import {
  FaBookOpen,
  FaBrain,
  FaProjectDiagram,
  FaComments,
  FaFeatherAlt,
  FaFolderOpen,
  FaListOl,
  FaMagic,
  FaRobot,
  FaShapes,
  FaStickyNote,
  FaUsers,
} from 'react-icons/fa'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAssistantStore } from '../stores/assistantStore'
import { useTaskStore } from '../stores/taskStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

interface NavigationItem {
  to: string
  label: string
  icon: typeof FaBookOpen
}

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: '项目',
    items: [
      { to: '/workbench', label: '工作台总览', icon: FaBookOpen },
      { to: '/workbench/projects', label: '项目与配置', icon: FaFolderOpen },
      { to: '/workbench/materials', label: '故事素材库', icon: FaStickyNote },
    ],
  },
  {
    label: '设定',
    items: [
      { to: '/workbench/characters', label: '角色', icon: FaUsers },
      { to: '/workbench/worldview', label: '世界观', icon: FaShapes },
      { to: '/workbench/organizations', label: '组织', icon: FaProjectDiagram },
      { to: '/workbench/relations', label: '关系', icon: FaProjectDiagram },
    ],
  },
  {
    label: '结构与写作',
    items: [
      { to: '/workbench/outline', label: '卷章大纲', icon: FaListOl },
      { to: '/workbench/write', label: '章节写作', icon: FaFeatherAlt },
      { to: '/workbench/revisions', label: '章节修订', icon: FaMagic },
    ],
  },
  {
    label: '叙事与 Agent',
    items: [
      { to: '/workbench/memory', label: '叙事记忆', icon: FaBrain },
      { to: '/workbench/foreshadow', label: '伏笔', icon: FaStickyNote },
      { to: '/workbench/graph', label: '关系图谱', icon: FaProjectDiagram },
      { to: '/workbench/skills', label: '技能', icon: FaMagic },
      { to: '/workbench/assistant', label: 'AI 助手', icon: FaRobot },
      { to: '/workbench/sessions', label: '会话', icon: FaComments },
    ],
  },
]

function WorkbenchLayout() {
  const location = useLocation()
  const {
    projects,
    currentProject,
    loading,
    error,
    pendingProjectId,
    dirty,
    initialize,
    selectProject,
    confirmPendingProjectSwitch,
    cancelPendingProjectSwitch,
  } = useWorkbenchStore()
  const subscribeTasks = useTaskStore((state) => state.subscribeToEvents)
  const subscribeAssistant = useAssistantStore((state) => state.subscribeToEvents)

  useEffect(() => {
    void initialize()
    const unsubscribeTasks = subscribeTasks()
    const unsubscribeAssistant = subscribeAssistant()
    return () => {
      unsubscribeTasks()
      unsubscribeAssistant()
    }
  }, [initialize, subscribeAssistant, subscribeTasks])

  const handleProjectChange = (projectId: string): void => {
    void selectProject(projectId)
  }

  const pendingProject = projects.find((project) => project.id === pendingProjectId)

  return (
    <Flex minH="100vh" bg="paper.100" color="ink.900" data-testid="workbench-shell">
      <Box
        as="aside"
        w={{ base: '72px', lg: '276px' }}
        bg="ink.900"
        color="paper.50"
        flexShrink={0}
        px={{ base: 2, lg: 4 }}
        py={5}
        overflowY="auto"
      >
        <HStack justify={{ base: 'center', lg: 'flex-start' }} spacing={3} mb={6}>
          <Box w="28px" h="28px" borderRadius="8px" bg="cinnabar.400" display="grid" placeItems="center">
            <Icon as={FaFeatherAlt} boxSize={3.5} />
          </Box>
          <Box display={{ base: 'none', lg: 'block' }}>
            <Text fontWeight="bold" letterSpacing="0.04em">yourcrush</Text>
            <Text fontSize="xs" color="ink.300">长篇创作工作台</Text>
          </Box>
        </HStack>
        <Stack spacing={5}>
          {navigationGroups.map((group) => (
            <Box key={group.label}>
              <Text display={{ base: 'none', lg: 'block' }} fontSize="xs" color="ink.400" mb={2} px={2}>
                {group.label}
              </Text>
              <Stack spacing={1}>
                {group.items.map((item) => {
                  const active = item.to === '/workbench'
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to)
                  return (
                    <Box
                      key={item.to}
                      as={NavLink}
                      to={item.to}
                      display="flex"
                      alignItems="center"
                      justifyContent={{ base: 'center', lg: 'flex-start' }}
                      gap={3}
                      px={{ base: 2, lg: 3 }}
                      py={2.5}
                      borderRadius="6px"
                      bg={active ? 'rgba(255, 253, 246, 0.14)' : 'transparent'}
                      color={active ? 'paper.50' : 'ink.300'}
                      borderLeft="3px solid"
                      borderColor={active ? 'cinnabar.400' : 'transparent'}
                      _hover={{ bg: 'rgba(255, 253, 246, 0.10)', color: 'paper.50' }}
                      data-testid={`workbench-nav-${item.to.replace(/\//g, '-').replace(/^-/, '') || 'home'}`}
                    >
                      <Icon as={item.icon} boxSize={4} />
                      <Text display={{ base: 'none', lg: 'block' }} fontSize="sm">{item.label}</Text>
                    </Box>
                  )
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
        <Box display={{ base: 'none', lg: 'block' }} mt={8} pt={4} borderTop="1px solid" borderColor="ink.700">
          <Text fontSize="xs" color="ink.400">旧功能入口</Text>
          <Text as={NavLink} to="/fragment" display="block" mt={2} fontSize="sm" color="ink.300" _hover={{ color: 'paper.50' }}>
            碎片日记
          </Text>
          <Text as={NavLink} to="/journal" display="block" mt={1} fontSize="sm" color="ink.300" _hover={{ color: 'paper.50' }}>
            Day 日常写作
          </Text>
        </Box>
      </Box>

      <Box flex={1} minW={0} minH="100vh">
        <Flex
          as="header"
          px={{ base: 4, md: 8 }}
          py={3}
          bg="rgba(255, 253, 246, 0.9)"
          borderBottom="1px solid"
          borderColor="ink.200"
          align="center"
          justify="space-between"
          gap={4}
          position="sticky"
          top={0}
          zIndex={5}
        >
          <Box minW={0}>
            <Text fontSize="xs" color="ink.500">当前项目</Text>
            <HStack mt={1}>
              <Select
                size="sm"
                value={currentProject?.id ?? ''}
                onChange={(event) => handleProjectChange(event.target.value)}
                maxW={{ base: '190px', md: '320px' }}
                placeholder="选择项目"
                data-testid="workbench-project-switcher"
              >
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </Select>
              {dirty && <Badge colorScheme="orange">有未保存修改</Badge>}
            </HStack>
          </Box>
          <HStack spacing={3} display={{ base: 'none', md: 'flex' }}>
            <Badge colorScheme={currentProject ? 'green' : 'orange'}>
              {currentProject ? '本地项目' : '尚未创建项目'}
            </Badge>
            <Text fontSize="sm" color="ink.600">HashRouter 工作区</Text>
          </HStack>
        </Flex>

        {error && (
          <Alert status="warning" borderRadius={0} data-testid="workbench-error">
            <AlertIcon />
            <Text flex={1}>{error}</Text>
            <Button size="xs" variant="outline" onClick={() => void initialize()}>重试</Button>
          </Alert>
        )}

        {loading && !currentProject && (
          <Flex minH="60vh" align="center" justify="center">
            <VStack spacing={3}><Spinner color="cinnabar.500" size="xl" /><Text color="ink.600">正在加载工作台。</Text></VStack>
          </Flex>
        )}
        {(!loading || currentProject) && <Outlet />}
      </Box>

      {pendingProject && (
        <Box position="fixed" right={{ base: 4, md: 8 }} bottom={{ base: 4, md: 8 }} zIndex={20} maxW="420px">
          <Alert status="warning" display="block" boxShadow="inkPanel" borderWidth="1px">
            <HStack align="flex-start"><AlertIcon mt={1} /><Box><Text fontWeight="bold">切换项目会丢失未保存内容</Text><Text fontSize="sm" mt={1}>要切换到「{pendingProject.name}」吗？</Text></Box></HStack>
            <Divider my={3} />
            <HStack justify="flex-end">
              <Button size="sm" variant="outline" onClick={cancelPendingProjectSwitch}>继续编辑</Button>
              <Button size="sm" colorScheme="cinnabar" onClick={() => void confirmPendingProjectSwitch()}>放弃并切换</Button>
            </HStack>
          </Alert>
        </Box>
      )}
    </Flex>
  )
}

export default WorkbenchLayout
