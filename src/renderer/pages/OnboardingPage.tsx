import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Center,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Progress,
  Select,
  Spinner,
  Stack,
  Switch,
  Text,
  Textarea,
  useToast,
  VStack,
} from '@chakra-ui/react'
import { Navigate, useNavigate } from 'react-router-dom'
import crushService from '../services/crushService'
import { useAppStore } from '../stores/appStore'
import { InkPage } from '../components/InkDesign'
import { buildDefaultCrushSlug, sanitizeCrushSlug } from '../../shared/crush/slug'
import {
  PHASE_PROMPT_CONFIG,
  PHASE_PROMPT_ORDER,
} from '../../shared/relationship/phase_prompts'
import type { RelationshipPhase } from '../../shared/relationship/models'

interface CreatedCrush {
  slug: string
  name: string
  nickname: string
}

function OnboardingPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const {
    hasFetchedCrushes,
    loading,
    fetchCrushes,
    needsOnboarding,
    hasCompletedOnboarding,
    setActiveSlug,
  } = useAppStore()

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [gender, setGender] = useState('unknown')
  const [description, setDescription] = useState('')
  const [manualSlug, setManualSlug] = useState(false)
  const [slug, setSlug] = useState('')
  const [initialPhase, setInitialPhase] = useState<RelationshipPhase>(0)
  const [submitting, setSubmitting] = useState(false)
  const [createdCrush, setCreatedCrush] = useState<CreatedCrush | null>(null)

  useEffect(() => {
    if (!hasFetchedCrushes && !loading) {
      fetchCrushes()
    }
  }, [fetchCrushes, hasFetchedCrushes, loading])

  useEffect(() => {
    if (!manualSlug) {
      setSlug(buildDefaultCrushSlug(name, nickname))
    }
  }, [manualSlug, name, nickname])

  const stepProgress = useMemo(() => ((step + 1) / 4) * 100, [step])

  if (!hasFetchedCrushes || loading) {
    return (
      <Center h="100%">
        <VStack spacing={3}>
          <Spinner size="xl" color="cinnabar.500" />
          <Text color="ink.500">正在准备首次上手体验。</Text>
        </VStack>
      </Center>
    )
  }

  if (!needsOnboarding()) {
    if (hasCompletedOnboarding() && !createdCrush) {
      return <Navigate to="/progress" replace />
    }

    if (!createdCrush) {
      return null
    }
  }

  const handleNext = async () => {
    if (step === 1) {
      if (!name.trim() || !nickname.trim()) {
        toast({
          title: '请先补全必要信息',
          description: '角色名和称呼都是必填项。',
          status: 'warning',
          duration: 3000,
        })
        return
      }
    }

    if (step === 2) {
      setSubmitting(true)
      try {
        const response = await crushService.create({
          name: name.trim(),
          nickname: nickname.trim(),
          gender,
          description: description.trim() || undefined,
          slug: sanitizeCrushSlug(slug) || undefined,
          initialPhase,
        })

        if (!response.success || !response.data) {
          throw new Error(response.errors?.[0] || '创建角色失败')
        }

        const data = response.data as CreatedCrush
        setCreatedCrush(data)
        await fetchCrushes()
        setActiveSlug(data.slug)
        setStep(3)
      } catch (error: any) {
        toast({
          title: '创建角色失败',
          description: error.message || '请稍后重试',
          status: 'error',
          duration: 4000,
        })
      } finally {
        setSubmitting(false)
      }
      return
    }

    setStep((current) => Math.min(current + 1, 3))
  }

  const handleBack = () => {
    setStep((current) => Math.max(current - 1, 0))
  }

  const phaseConfig = PHASE_PROMPT_CONFIG[initialPhase]

  return (
    <InkPage
      data-testid="onboarding-page"
      title="先把这段关系放进你的故事里"
      eyebrow="首次上手"
      subtitle="先创建角色、确定关系起点，再进入关系页看清接下来怎么玩。"
    >
        <Progress value={stepProgress} size="sm" borderRadius="full" colorScheme="cinnabar" />

        <Card>
          <CardHeader>
            <HStack justify="space-between" align="baseline">
              <Heading size="md">
                {step === 0 && '1. 欢迎'}
                {step === 1 && '2. 角色基础信息'}
                {step === 2 && '3. 关系起点'}
                {step === 3 && '4. 完成'}
              </Heading>
              <Text fontSize="sm" color="ink.500">步骤 {step + 1} / 4</Text>
            </HStack>
          </CardHeader>
          <CardBody>
            {step === 0 && (
              <Stack spacing={5}>
                <Alert status="info" borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <AlertTitle>你的数据只保存在本地</AlertTitle>
                    <AlertDescription>
                      角色资料、碎片记录和关系进度都会写在本机目录里，不需要先配置外部服务才能开始理解玩法。
                    </AlertDescription>
                  </Box>
                </Alert>

                <Box>
                  <Heading size="sm" mb={3}>这款应用的三条主线</Heading>
                  <Stack spacing={3}>
                    <Box>
                      <Text fontWeight="medium">角色</Text>
                      <Text color="ink.600">先定义 ta 是谁，你们现在走到了哪一步。</Text>
                    </Box>
                    <Box>
                      <Text fontWeight="medium">碎片</Text>
                      <Text color="ink.600">把一句话、一个动作、一次相处，先记成最小的心动片段。</Text>
                    </Box>
                    <Box>
                      <Text fontWeight="medium">关系进度</Text>
                      <Text color="ink.600">把这段关系放到阶段地图里，知道下一步为什么值得继续写。</Text>
                    </Box>
                  </Stack>
                </Box>
              </Stack>
            )}

            {step === 1 && (
              <Stack spacing={5}>
                <FormControl isRequired>
                  <FormLabel>角色名</FormLabel>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="你想怎么称呼 ta"
                    data-testid="onboarding-name"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>平时称呼</FormLabel>
                  <Input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="例如：夏夏、小周、阿琳"
                    data-testid="onboarding-nickname"
                  />
                </FormControl>

                <HStack align="flex-start" spacing={4}>
                  <FormControl>
                    <FormLabel>性别</FormLabel>
                    <Select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      data-testid="onboarding-gender"
                    >
                      <option value="unknown">暂不设置</option>
                      <option value="female">女生</option>
                      <option value="male">男生</option>
                      <option value="other">其他</option>
                    </Select>
                  </FormControl>
                </HStack>

                <FormControl>
                  <FormLabel>一句话描述</FormLabel>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="可选，例如：同组同事，最近开始频繁一起吃午饭"
                    minH="120px"
                    data-testid="onboarding-description"
                  />
                </FormControl>

                <Divider />

                <HStack justify="space-between" align="center">
                  <Box>
                    <Text fontWeight="medium">高级设置</Text>
                    <Text fontSize="sm" color="ink.500">
                      默认会自动生成角色标识，只有在你需要手动控制目录名时再打开。
                    </Text>
                  </Box>
                  <Switch
                    isChecked={manualSlug}
                    onChange={(e) => setManualSlug(e.target.checked)}
                    data-testid="onboarding-manual-slug"
                  />
                </HStack>

                <FormControl isDisabled={!manualSlug}>
                  <FormLabel>角色标识</FormLabel>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="自动生成"
                    data-testid="onboarding-slug"
                  />
                  <Text mt={2} fontSize="sm" color="ink.500">
                    当前将保存为：<code>{sanitizeCrushSlug(slug) || buildDefaultCrushSlug(name, nickname)}</code>
                  </Text>
                </FormControl>
              </Stack>
            )}

            {step === 2 && (
              <Stack spacing={5}>
                <Box>
                  <Text color="ink.600" mb={4}>
                    先选择你们现在最接近的阶段。后续关系页会以这里为起点，帮你看清接下来能怎么推进。
                  </Text>
                  <Stack spacing={3}>
                    {PHASE_PROMPT_ORDER.map((phase) => {
                      const config = PHASE_PROMPT_CONFIG[phase]
                      const selected = phase === initialPhase

                      return (
                        <Button
                          key={phase}
                          variant={selected ? 'solid' : 'outline'}
                          colorScheme={selected ? 'cinnabar' : 'ink'}
                          justifyContent="flex-start"
                          h="auto"
                          py={4}
                          px={5}
                          onClick={() => setInitialPhase(phase)}
                          data-testid={`onboarding-phase-${phase}`}
                        >
                          <Box textAlign="left">
                            <Text fontWeight="semibold">{config.name}</Text>
                            <Text fontSize="sm" whiteSpace="normal">
                              {config.description}
                            </Text>
                          </Box>
                        </Button>
                      )
                    })}
                  </Stack>
                </Box>

                <Alert status="success" borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <AlertTitle>{phaseConfig.name}</AlertTitle>
                    <AlertDescription>
                      创建完成后，你会直接进入关系页，从这个阶段开始看路线图和下一步建议。
                    </AlertDescription>
                  </Box>
                </Alert>
              </Stack>
            )}

            {step === 3 && createdCrush && (
              <Stack spacing={5}>
                <Alert status="success" borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <AlertTitle>角色已经准备好了</AlertTitle>
                    <AlertDescription>
                      你创建了 <strong>{createdCrush.name}</strong>，当前起点是「{phaseConfig.name}」阶段。
                    </AlertDescription>
                  </Box>
                </Alert>

                <Box>
                  <Heading size="sm" mb={3}>接下来你会看到什么</Heading>
                  <Stack spacing={2} color="ink.600">
                    <Text>1. 关系页会展示完整 5 阶段路线图，帮你确认现在在故事里的位置。</Text>
                    <Text>2. 你会看到推荐下一步，例如先记第一条碎片，或者直接写第一篇 Day。</Text>
                    <Text>3. 以后每次记录内容，都能回到这条关系线里继续推进。</Text>
                  </Stack>
                </Box>

                <Button
                  colorScheme="cinnabar"
                  size="lg"
                  onClick={() => navigate('/progress')}
                  data-testid="onboarding-finish"
                >
                  进入关系页
                </Button>
              </Stack>
            )}
          </CardBody>
        </Card>

        <HStack justify="space-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            isDisabled={step === 0 || submitting || step === 3}
          >
            上一步
          </Button>

          {step < 3 && (
            <Button
              colorScheme="cinnabar"
              onClick={handleNext}
              isLoading={submitting}
              loadingText="创建中"
              data-testid="onboarding-next"
            >
              {step === 2 ? '创建并继续' : '下一步'}
            </Button>
          )}
        </HStack>
    </InkPage>
  )
}

export default OnboardingPage
