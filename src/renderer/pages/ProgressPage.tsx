import { useEffect, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Center,
  Divider,
  Heading,
  HStack,
  Progress,
  Stack,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../stores/appStore'
import { InkPage } from '../components/InkDesign'
import {
  PHASE_PROMPT_CONFIG,
  PHASE_PROMPT_ORDER,
} from '../../shared/relationship/phase_prompts'
import {
  PHASE_NAMES,
  type RelationshipPhase,
} from '../../shared/relationship/models'

interface ProgressData {
  crush_slug: string
  current_phase: RelationshipPhase
  phase_name: string
  total_narratives: number
  interaction_narratives: number
  flirting_signals: number
  accumulated_score: number
  threshold: number
  signals: Array<{
    type: string
    description: string
    score: number
    detected_at: string
    narrative_excerpt?: string
  }>
  phase_history: Array<{
    phase: RelationshipPhase
    phase_name: string
    started_at: string
    ended_at?: string
    duration_days?: number
    narrative_count: number
    transition_reason?: string
  }>
  created_at: string
  updated_at: string
}

const PHASE_COLORS: Record<RelationshipPhase, string> = {
  0: 'ink',
  1: 'bamboo',
  2: 'cinnabar',
  3: 'cinnabar',
  4: 'bamboo',
}

function getAdvanceLabel(phase: RelationshipPhase): string {
  if (phase === 2) return '进入表白'
  if (phase === 3) return '进入热恋'
  return '手动推进阶段'
}

function ProgressPage() {
  const navigate = useNavigate()
  const { activeSlug, needsOnboarding } = useAppStore()
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (activeSlug) {
      loadProgress()
      return
    }

    setLoading(false)
    setProgress(null)
    setError(null)
  }, [activeSlug])

  const loadProgress = async () => {
    if (!activeSlug) return

    setLoading(true)
    setError(null)

    try {
      const result = await window.electronAPI.relationshipProgress(activeSlug)
      if (result.success) {
        setProgress(result.data)
      } else {
        setError(result.errors?.[0] || '加载进度数据失败')
      }
    } catch (e: any) {
      setError(e.message || '加载进度数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdvancePhase = async () => {
    if (!activeSlug || !progress) return

    try {
      const result = await window.electronAPI.relationshipAdvancePhase(activeSlug, '用户手动推进')
      if (result.success) {
        setProgress(result.data)
        toast({
          title: '阶段推进成功',
          description: `已进入${PHASE_NAMES[result.data.current_phase as RelationshipPhase]}阶段`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        })
      } else {
        toast({
          title: '推进失败',
          description: result.errors?.[0] || '未知错误',
          status: 'error',
          duration: 3000,
          isClosable: true,
        })
      }
    } catch (e: any) {
      toast({
        title: '推进失败',
        description: e.message || '未知错误',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  if (!activeSlug) {
    return (
      <Center h="100%" data-testid="progress-page">
        <Box maxW="560px">
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>{needsOnboarding() ? '先完成首次设置' : '请先选择一个角色'}</AlertTitle>
              <AlertDescription>
                {needsOnboarding()
                  ? '先创建角色并确认你们现在的关系起点，再回来查看完整的关系路线图。'
                  : '选定角色后，这里会展示关系阶段、进展信号和下一步建议。'}
              </AlertDescription>
              <Button
                mt={3}
                size="sm"
                colorScheme="cinnabar"
                onClick={() => navigate(needsOnboarding() ? '/onboarding' : '/journal')}
              >
                {needsOnboarding() ? '去完成首次设置' : '回到日常写作'}
              </Button>
            </Box>
          </Alert>
        </Box>
      </Center>
    )
  }

  if (loading) {
    return (
      <Center h="100%" data-testid="progress-page">
        <Spinner size="xl" color="cinnabar.500" />
      </Center>
    )
  }

  if (error) {
    return (
      <Center h="100%" data-testid="progress-page">
        <VStack>
          <Text color="cinnabar.600">{error}</Text>
          <Button onClick={loadProgress}>重试</Button>
        </VStack>
      </Center>
    )
  }

  if (!progress) {
    return (
      <Center h="100%" data-testid="progress-page">
        <Text color="ink.500">暂无进度数据</Text>
      </Center>
    )
  }

  const currentPhase = progress.current_phase
  const currentPhaseConfig = PHASE_PROMPT_CONFIG[currentPhase]
  const firstUseMode = progress.total_narratives === 0
  const phaseProgress = progress.threshold > 0
    ? Math.min(100, (progress.accumulated_score / progress.threshold) * 100)
    : 100

  return (
    <InkPage
      data-testid="progress-page"
      title="关系进度"
      titleTestId="progress-page-title"
      eyebrow="RELATIONSHIP"
      subtitle="把阶段、信号和历史放在一张关系地图里，观察这段故事如何往前走。"
    >
        {firstUseMode && (
          <Card
            borderWidth="1px"
            borderColor="cinnabar.200"
            bg="cinnabar.50"
            data-testid="progress-first-use"
          >
            <CardHeader>
              <Heading size="md">你已经站在这段关系的起点上</Heading>
            </CardHeader>
            <CardBody>
              <Stack spacing={5}>
                <Box>
                  <HStack spacing={3} mb={2}>
                    <Badge colorScheme={PHASE_COLORS[currentPhase]} fontSize="md" px={3} py={1}>
                      {currentPhaseConfig.name}
                    </Badge>
                    <Text color="ink.700">
                      当前起点：阶段 {currentPhase + 1} / {PHASE_PROMPT_ORDER.length}
                    </Text>
                  </HStack>
                  <Text color="ink.700">
                    {currentPhaseConfig.description}。接下来你可以先去记录一条碎片，或者直接写第一篇 Day，让这条关系线开始真正动起来。
                  </Text>
                </Box>

                <Box>
                  <Heading size="sm" mb={3}>完整路线图</Heading>
                  <Stack spacing={3}>
                    {PHASE_PROMPT_ORDER.map((phase) => {
                      const config = PHASE_PROMPT_CONFIG[phase]
                      const isCurrent = phase === currentPhase

                      return (
                        <HStack
                          key={phase}
                          spacing={3}
                          p={3}
                          borderRadius="md"
                          bg={isCurrent ? 'paper.50' : 'transparent'}
                          borderWidth={isCurrent ? '1px' : '0px'}
                          borderColor={isCurrent ? 'cinnabar.200' : 'transparent'}
                        >
                          <Badge colorScheme={PHASE_COLORS[phase]} minW="56px" textAlign="center">
                            {config.name}
                          </Badge>
                          <Text fontSize="sm" color="ink.600" flex="1">
                            {config.description}
                          </Text>
                          {isCurrent && <Badge colorScheme="bamboo">当前起点</Badge>}
                        </HStack>
                      )
                    })}
                  </Stack>
                </Box>

                <HStack spacing={3}>
                  <Button
                    colorScheme="cinnabar"
                    onClick={() => navigate('/fragment')}
                    data-testid="progress-cta-fragment"
                  >
                    去记录第一条碎片
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/journal')}
                    data-testid="progress-cta-day"
                  >
                    去写第一篇 Day
                  </Button>
                </HStack>
              </Stack>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader>
            <HStack justify="space-between">
              <HStack>
                <Badge
                  colorScheme={PHASE_COLORS[currentPhase]}
                  fontSize="md"
                  px={3}
                  py={1}
                  data-testid="progress-current-phase"
                >
                  {PHASE_NAMES[currentPhase]}
                </Badge>
                <Text fontSize="sm" color="ink.500">
                  阶段 {currentPhase + 1} / {PHASE_PROMPT_ORDER.length}
                </Text>
              </HStack>
              {!firstUseMode && currentPhase < PHASE_PROMPT_ORDER.length - 1 && (
                <Button
                  size="sm"
                  colorScheme={PHASE_COLORS[currentPhase]}
                  onClick={handleAdvancePhase}
                >
                  {getAdvanceLabel(currentPhase)}
                </Button>
              )}
            </HStack>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              {progress.threshold > 0 && !firstUseMode && (
                <Box>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm">阶段进度</Text>
                    <Text fontSize="sm" color="ink.500">
                      {progress.accumulated_score} / {progress.threshold} 分
                    </Text>
                  </HStack>
                  <Progress
                    value={phaseProgress}
                    colorScheme={PHASE_COLORS[currentPhase]}
                    size="lg"
                    borderRadius="md"
                  />
                </Box>
              )}

              <Text color="ink.600">{currentPhaseConfig.description}</Text>

              <HStack spacing={8}>
                <Stat>
                  <StatLabel>总叙事数</StatLabel>
                  <StatNumber>{progress.total_narratives}</StatNumber>
                </Stat>
                <Stat>
                  <StatLabel>互动叙事</StatLabel>
                  <StatNumber>{progress.interaction_narratives}</StatNumber>
                </Stat>
                <Stat>
                  <StatLabel>暧昧信号</StatLabel>
                  <StatNumber>{progress.flirting_signals}</StatNumber>
                </Stat>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {!firstUseMode && progress.signals.length > 0 && (
          <Card>
            <CardHeader>
              <Heading size="md">最近信号</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={3} align="stretch">
                {progress.signals.slice(-5).reverse().map((signal, index) => (
                  <Box
                    key={index}
                    p={3}
                    bg="paper.50"
                    borderRadius="md"
                    border="1px solid"
                    borderColor="ink.100"
                  >
                    <HStack justify="space-between">
                      <HStack>
                        <Badge colorScheme="bamboo">{signal.description}</Badge>
                        <Text fontSize="sm">+{signal.score} 分</Text>
                      </HStack>
                      <Text fontSize="xs" color="ink.500">
                        {new Date(signal.detected_at).toLocaleDateString()}
                      </Text>
                    </HStack>
                    {signal.narrative_excerpt && (
                      <Text fontSize="sm" color="ink.600" mt={2} fontStyle="italic">
                        "{signal.narrative_excerpt}"
                      </Text>
                    )}
                  </Box>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}

        {!firstUseMode && (
          <Card>
            <CardHeader>
              <Heading size="md">阶段历史</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={4} align="stretch">
                {progress.phase_history.map((history, index) => (
                  <Box key={`${history.phase}-${history.started_at}`}>
                    <HStack justify="space-between">
                      <HStack>
                        <Badge colorScheme={PHASE_COLORS[history.phase]}>
                          {history.phase_name}
                        </Badge>
                        <Text fontSize="sm">
                          {history.narrative_count} 篇叙事
                        </Text>
                      </HStack>
                      <Text fontSize="xs" color="ink.500">
                        {new Date(history.started_at).toLocaleDateString()}
                        {history.ended_at && ` - ${new Date(history.ended_at).toLocaleDateString()}`}
                        {history.duration_days && ` (${history.duration_days} 天)`}
                      </Text>
                    </HStack>
                    {history.transition_reason && (
                      <Text fontSize="sm" color="ink.600" mt={1}>
                        原因：{history.transition_reason}
                      </Text>
                    )}
                    {index < progress.phase_history.length - 1 && <Divider mt={3} />}
                  </Box>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}
    </InkPage>
  )
}

export default ProgressPage
