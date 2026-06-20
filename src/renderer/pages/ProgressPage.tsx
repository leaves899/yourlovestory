import React, { useEffect, useState } from 'react'
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Progress,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Divider,
  Button,
  useToast,
  Spinner,
  Center,
} from '@chakra-ui/react'
import { FaArrowRight, FaHeart, FaStar, FaClock } from 'react-icons/fa'
import { useAppStore } from '../stores/appStore'

interface ProgressData {
  crush_slug: string
  current_phase: number
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
    phase: number
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

const PHASE_NAMES: Record<number, string> = {
  0: '陌生人',
  1: '认识',
  2: '暧昧',
  3: '表白',
  4: '热恋',
}

const PHASE_COLORS: Record<number, string> = {
  0: 'gray',
  1: 'blue',
  2: 'pink',
  3: 'red',
  4: 'purple',
}

const PHASE_ICONS: Record<number, any> = {
  0: FaStar,
  1: FaClock,
  2: FaHeart,
  3: FaHeart,
  4: FaHeart,
}

function ProgressPage() {
  const { activeSlug } = useAppStore()
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (activeSlug) {
      loadProgress()
    }
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
          description: `已进入${PHASE_NAMES[result.data.current_phase]}阶段`,
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
      <Center h="100%">
        <Text color="gray.500">请先选择一个角色</Text>
      </Center>
    )
  }

  if (loading) {
    return (
      <Center h="100%">
        <Spinner size="xl" color="blue.500" />
      </Center>
    )
  }

  if (error) {
    return (
      <Center h="100%">
        <VStack>
          <Text color="red.500">{error}</Text>
          <Button onClick={loadProgress}>重试</Button>
        </VStack>
      </Center>
    )
  }

  if (!progress) {
    return (
      <Center h="100%">
        <Text color="gray.500">暂无进度数据</Text>
      </Center>
    )
  }

  const currentPhase = progress.current_phase
  const phaseProgress = progress.threshold > 0
    ? Math.min(100, (progress.accumulated_score / progress.threshold) * 100)
    : 100

  return (
    <Box p={6} maxW="800px" mx="auto">
      <VStack spacing={6} align="stretch">
        {/* 标题 */}
        <Heading size="lg">关系进度</Heading>

        {/* 当前阶段卡片 */}
        <Card>
          <CardHeader>
            <HStack justify="space-between">
              <HStack>
                <Badge colorScheme={PHASE_COLORS[currentPhase]} fontSize="md" px={3} py={1}>
                  {PHASE_NAMES[currentPhase]}
                </Badge>
                <Text fontSize="sm" color="gray.500">
                  阶段 {currentPhase + 1} / 4
                </Text>
              </HStack>
              {currentPhase < 3 && (
                <Button
                  size="sm"
                  colorScheme={PHASE_COLORS[currentPhase]}
                  onClick={handleAdvancePhase}
                  isDisabled={currentPhase === 2 && progress.accumulated_score < progress.threshold}
                >
                  {currentPhase === 2 ? '表白' : '推进阶段'}
                </Button>
              )}
            </HStack>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              {/* 进度条 */}
              {currentPhase < 3 && (
                <Box>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm">阶段进度</Text>
                    <Text fontSize="sm" color="gray.500">
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

              {/* 统计数据 */}
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

        {/* 最近信号 */}
        {progress.signals.length > 0 && (
          <Card>
            <CardHeader>
              <Heading size="md">最近信号</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={3} align="stretch">
                {progress.signals.slice(-5).reverse().map((signal, index) => (
                  <Box key={index} p={3} bg="gray.50" borderRadius="md">
                    <HStack justify="space-between">
                      <HStack>
                        <Badge colorScheme="purple">{signal.description}</Badge>
                        <Text fontSize="sm">+{signal.score} 分</Text>
                      </HStack>
                      <Text fontSize="xs" color="gray.500">
                        {new Date(signal.detected_at).toLocaleDateString()}
                      </Text>
                    </HStack>
                    {signal.narrative_excerpt && (
                      <Text fontSize="sm" color="gray.600" mt={2} fontStyle="italic">
                        "{signal.narrative_excerpt}"
                      </Text>
                    )}
                  </Box>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}

        {/* 阶段历史 */}
        <Card>
          <CardHeader>
            <Heading size="md">阶段历史</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              {progress.phase_history.map((history, index) => (
                <Box key={index}>
                  <HStack justify="space-between">
                    <HStack>
                      <Badge colorScheme={PHASE_COLORS[history.phase]}>
                        {history.phase_name}
                      </Badge>
                      <Text fontSize="sm">
                        {history.narrative_count} 篇叙事
                      </Text>
                    </HStack>
                    <Text fontSize="xs" color="gray.500">
                      {new Date(history.started_at).toLocaleDateString()}
                      {history.ended_at && ` - ${new Date(history.ended_at).toLocaleDateString()}`}
                      {history.duration_days && ` (${history.duration_days} 天)`}
                    </Text>
                  </HStack>
                  {history.transition_reason && (
                    <Text fontSize="sm" color="gray.600" mt={1}>
                      原因：{history.transition_reason}
                    </Text>
                  )}
                  {index < progress.phase_history.length - 1 && <Divider mt={3} />}
                </Box>
              ))}
            </VStack>
          </CardBody>
        </Card>

        {/* 阶段说明 */}
        <Card>
          <CardHeader>
            <Heading size="md">阶段说明</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              {Object.entries(PHASE_NAMES).map(([phase, name]) => (
                <HStack key={phase} spacing={4}>
                  <Badge
                    colorScheme={PHASE_COLORS[Number(phase)]}
                    minW="60px"
                    textAlign="center"
                  >
                    {name}
                  </Badge>
                  <Text fontSize="sm" color="gray.600">
                    {Number(phase) === 0 && '单方面关注，几乎没有交集'}
                    {Number(phase) === 1 && '有基本互动，知道彼此存在'}
                    {Number(phase) === 2 && '频繁互动，有情感张力'}
                    {Number(phase) === 3 && '明确关系，正式在一起'}
                    {Number(phase) === 4 && '时时刻刻都想亲密，形影不离'}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </CardBody>
        </Card>
      </VStack>
    </Box>
  )
}

export default ProgressPage
