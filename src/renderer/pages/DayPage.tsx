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
  Heading,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Spinner,
  Stack,
  Text,
  Textarea,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import type {
  DayPromptPreviewData,
  GeneratedDayData,
} from '../../shared/day/dayService'
import { useDayStore } from '../stores/dayStore'
import { useAppStore } from '../stores/appStore'
import { InkPage } from '../components/InkDesign'

interface RelationshipPromptState {
  message: string
}

function isGeneratedDayData(
  data: GeneratedDayData | DayPromptPreviewData
): data is GeneratedDayData {
  return 'content' in data
}

function DayPage() {
  const navigate = useNavigate()
  const [dayNumber, setDayNumber] = useState(1)
  const [summary, setSummary] = useState('')
  const [editingDay, setEditingDay] = useState<{ dayNumber: number; content: string } | null>(null)
  const [editContent, setEditContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [expandedDay, setExpandedDay] = useState<number | null>(null)
  const [expandedContent, setExpandedContent] = useState('')
  const [relationshipPrompt, setRelationshipPrompt] = useState<RelationshipPromptState | null>(null)
  const {
    items: days,
    fetch: fetchDays,
    generate: generateDay,
    update: updateDay,
    delete: deleteDay,
    get: getDay,
  } = useDayStore()
  const { activeSlug, crushes, needsOnboarding } = useAppStore()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const toast = useToast()

  useEffect(() => {
    if (activeSlug) {
      setGenerating(false)
      setProgress(0)
      setRelationshipPrompt(null)
      fetchDays(activeSlug)
      return
    }

    setRelationshipPrompt(null)
  }, [activeSlug, fetchDays])

  const handleGenerate = async () => {
    if (!activeSlug) return
    setGenerating(true)
    setProgress(0)

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev
        return prev + Math.random() * 15
      })
    }, 500)

    try {
      const result = await generateDay(activeSlug, dayNumber, summary)
      if (result.success) {
        setProgress(100)

        const generatedData = isGeneratedDayData(result.data) ? result.data : null
        const relationship = generatedData?.relationship
        if (relationship?.shouldTransition) {
          setRelationshipPrompt({
            message:
              relationship.transitionMessage ??
              '检测到关系阶段可能可以推进，去关系进度页确认。',
          })
        } else {
          setRelationshipPrompt(null)
        }

        toast({
          title: '生成成功',
          status: 'success',
          duration: 3000,
        })

        if (result.warnings && result.warnings.length > 0) {
          toast({
            title: 'Day 已生成，但关系进度未能同步',
            description: result.warnings[0],
            status: 'warning',
            duration: 5000,
            isClosable: true,
          })
        }

        onClose()
        fetchDays(activeSlug)
      } else {
        toast({
          title: '生成失败',
          description: result.errors?.[0] || '未知错误',
          status: 'error',
          duration: 3000,
        })
      }
    } catch (error: any) {
      toast({
        title: '生成失败',
        description: error.message,
        status: 'error',
        duration: 3000,
      })
    } finally {
      clearInterval(progressInterval)
      setTimeout(() => {
        setGenerating(false)
        setProgress(0)
      }, 500)
    }
  }

  const handleEdit = (day: { day_number: number; content: string }) => {
    setEditingDay({ dayNumber: day.day_number, content: day.content })
    setEditContent(day.content)
    onEditOpen()
  }

  const handleSaveEdit = async () => {
    if (!activeSlug || !editingDay) return
    try {
      await updateDay(activeSlug, editingDay.dayNumber, editContent)
      toast({
        title: '更新成功',
        status: 'success',
        duration: 3000,
      })
      onEditClose()
      setEditingDay(null)
    } catch (error: any) {
      toast({
        title: '更新失败',
        description: error.message,
        status: 'error',
        duration: 3000,
      })
    }
  }

  const handleDelete = async (dayNumberToDelete: number) => {
    if (!activeSlug) return
    try {
      const result = await deleteDay(activeSlug, dayNumberToDelete)
      if (result.success) {
        toast({
          title: '删除成功',
          status: 'success',
          duration: 3000,
        })
        fetchDays(activeSlug)
      } else {
        toast({
          title: '删除失败',
          description: result.errors?.[0] || '未知错误',
          status: 'error',
          duration: 3000,
        })
      }
    } catch (error: any) {
      toast({
        title: '删除失败',
        description: error.message,
        status: 'error',
        duration: 3000,
      })
    }
  }

  if (!activeSlug) {
    return (
      <InkPage
        data-testid="day-page"
        title="日常写作"
        titleTestId="day-page-title"
        eyebrow="DAY WRITING"
        subtitle="把当天的线索写成完整叙事，像在纸上慢慢铺开一段关系。"
      >
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <Box>
            <AlertTitle>{needsOnboarding() ? '先完成首次设置' : '请选择一个角色'}</AlertTitle>
            <AlertDescription>
              {needsOnboarding()
                ? '先创建角色并确认关系起点，再回来写第一篇 Day，会更容易理解这条故事线。'
                : crushes.length === 0
                  ? '当前还没有可用角色，请先创建一个角色。'
                  : '请在侧边栏选择一个角色开始使用。'}
            </AlertDescription>
            <Button
              mt={3}
              size="sm"
              colorScheme="cinnabar"
              onClick={() => navigate(needsOnboarding() ? '/onboarding' : '/crush')}
            >
              {needsOnboarding() ? '去完成首次设置' : '去角色管理'}
            </Button>
          </Box>
        </Alert>
      </InkPage>
    )
  }

  return (
    <InkPage
      data-testid="day-page"
      title="日常写作"
      titleTestId="day-page-title"
      eyebrow="DAY WRITING"
      subtitle="把摘要扩展成一篇 Day，留下关系推进中的具体场景。"
      action={
        <Button
          onClick={onOpen}
          isDisabled={generating}
          data-testid="open-generate-day"
        >
          生成日常写作
        </Button>
      }
    >
      {relationshipPrompt && (
        <Alert
          status="success"
          borderRadius="md"
          mb={4}
          alignItems="flex-start"
          data-testid="day-relationship-alert"
        >
          <AlertIcon mt={1} />
          <Box flex="1">
            <AlertTitle>关系进度可能可以推进</AlertTitle>
            <AlertDescription>{relationshipPrompt.message}</AlertDescription>
          </Box>
          <HStack ml={4} alignSelf="center">
            <Button
              size="sm"
              colorScheme="bamboo"
              onClick={() => navigate('/progress')}
              data-testid="day-relationship-alert-cta"
            >
              去关系进度页
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRelationshipPrompt(null)}
              data-testid="day-relationship-alert-dismiss"
            >
              关闭
            </Button>
          </HStack>
        </Alert>
      )}

      {generating && (
        <Box mb={4}>
          <HStack mb={2}>
            <Spinner size="sm" />
            <Text fontSize="sm" color="ink.600">正在生成叙事，请稍候。</Text>
          </HStack>
          <Progress value={progress} size="sm" colorScheme="cinnabar" borderRadius="md" />
        </Box>
      )}

      <Stack spacing={4}>
        {days.map((day) => (
          <Card
            key={day.day_number}
            borderLeft="4px solid"
            borderLeftColor="cinnabar.500"
          >
            <CardHeader>
              <HStack justify="space-between" align="center">
                <Heading size="md">Day {day.day_number}</Heading>
                <Badge colorScheme="ink">手稿</Badge>
              </HStack>
            </CardHeader>
            <CardBody>
              <Text whiteSpace="pre-wrap" color="ink.800" lineHeight="1.9">
                {expandedDay === day.day_number ? expandedContent : day.content}
              </Text>
              <HStack mt={4} spacing={2}>
                {expandedDay === day.day_number ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setExpandedDay(null)
                      setExpandedContent('')
                    }}
                  >
                    收起
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!activeSlug) return
                      const result = await getDay(activeSlug, day.day_number)
                      if (result.success) {
                        const fullDay = result.data as { content: string }
                        setExpandedDay(day.day_number)
                        setExpandedContent(fullDay.content)
                      }
                    }}
                  >
                    查看完整内容
                  </Button>
                )}
                <Button onClick={() => handleEdit(day)}>
                  编辑
                </Button>
                <Button
                  variant="outline"
                  colorScheme="cinnabar"
                  onClick={() => handleDelete(day.day_number)}
                >
                  删除
                </Button>
              </HStack>
            </CardBody>
          </Card>
        ))}
      </Stack>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>生成日常写作</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <Box>
                <Text mb={2}>Day 编号</Text>
                <Textarea
                  value={dayNumber}
                  onChange={(e) => setDayNumber(Number(e.target.value))}
                  placeholder="输入 Day 编号"
                  data-testid="day-number-input"
                />
              </Box>
              <Box>
                <Text mb={2}>当天摘要</Text>
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="输入当天摘要，例如：今天和夏夏一起去了西湖边散步"
                  data-testid="day-summary-input"
                />
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button
              colorScheme="cinnabar"
              mr={3}
              onClick={handleGenerate}
              isLoading={generating}
              loadingText="生成中"
              data-testid="submit-generate-day"
            >
              生成
            </Button>
            <Button variant="ghost" onClick={onClose} isDisabled={generating}>
              取消
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isEditOpen} onClose={onEditClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>编辑 Day {editingDay?.dayNumber}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              minH="400px"
              placeholder="编辑日记内容"
            />
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="cinnabar" mr={3} onClick={handleSaveEdit}>
              保存
            </Button>
            <Button variant="ghost" onClick={onEditClose}>
              取消
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </InkPage>
  )
}

export default DayPage
