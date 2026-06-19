import React, { useState, useEffect } from 'react'
import {
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Stack,
  Text,
  Textarea,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Progress,
  HStack,
  Spinner,
} from '@chakra-ui/react'
import { useDayStore } from '../stores/dayStore'
import { useAppStore } from '../stores/appStore'

function DayPage() {
  const [dayNumber, setDayNumber] = useState(1)
  const [summary, setSummary] = useState('')
  const [editingDay, setEditingDay] = useState<{ dayNumber: number; content: string } | null>(null)
  const [editContent, setEditContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const { items: days, loading, error, fetch: fetchDays, generate: generateDay, update: updateDay, delete: deleteDay } = useDayStore()
  const { activeSlug, crushes } = useAppStore()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const toast = useToast()

  useEffect(() => {
    if (activeSlug) {
      fetchDays(activeSlug)
    }
  }, [activeSlug, fetchDays])

  const handleGenerate = async () => {
    if (!activeSlug) return
    setGenerating(true)
    setProgress(0)

    // 模拟进度（实际进度无法从 fetch 获取）
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev
        return prev + Math.random() * 15
      })
    }, 500)

    try {
      await generateDay(activeSlug, dayNumber, summary)
      setProgress(100)
      toast({
        title: '生成成功',
        status: 'success',
        duration: 3000,
      })
      onClose()
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

  const handleUpdate = async (dayNumber: number, content: string) => {
    if (!activeSlug) return
    try {
      await updateDay(activeSlug, dayNumber, content)
      toast({
        title: '更新成功',
        status: 'success',
        duration: 3000,
      })
    } catch (error: any) {
      toast({
        title: '更新失败',
        description: error.message,
        status: 'error',
        duration: 3000,
      })
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

  const handleDelete = async (dayNumber: number) => {
    if (!activeSlug) return
    try {
      await deleteDay(activeSlug, dayNumber)
      toast({
        title: '删除成功',
        status: 'success',
        duration: 3000,
      })
    } catch (error: any) {
      toast({
        title: '删除失败',
        description: error.message,
        status: 'error',
        duration: 3000,
      })
    }
  }

  // 没有选中角色时显示引导
  if (!activeSlug) {
    return (
      <Box>
        <Heading mb={4}>日常写作</Heading>
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <Box>
            <AlertTitle>欢迎使用 yourcrush</AlertTitle>
            <AlertDescription>
              {crushes.length === 0
                ? '请先在「角色管理」页面创建一个角色，或检查预置角色是否正确安装。'
                : '请在侧边栏选择一个角色开始使用。'}
            </AlertDescription>
          </Box>
        </Alert>
      </Box>
    )
  }

  return (
    <Box>
      <Heading mb={4}>日常写作</Heading>

      <Button onClick={onOpen} mb={4} isDisabled={generating}>
        生成日常写作
      </Button>

      {generating && (
        <Box mb={4}>
          <HStack mb={2}>
            <Spinner size="sm" />
            <Text fontSize="sm">正在生成叙事，请稍候...</Text>
          </HStack>
          <Progress value={progress} size="sm" colorScheme="blue" borderRadius="md" />
        </Box>
      )}

      <Stack spacing={4}>
        {days.map((day) => (
          <Card key={day.day_number}>
            <CardHeader>
              <Heading size="md">Day {day.day_number}</Heading>
            </CardHeader>
            <CardBody>
              <Text whiteSpace="pre-wrap">{day.content}</Text>
              <Button
                mt={4}
                onClick={() => handleEdit(day)}
              >
                编辑
              </Button>
              <Button
                mt={4}
                ml={2}
                colorScheme="red"
                onClick={() => handleDelete(day.day_number)}
              >
                删除
              </Button>
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
                />
              </Box>
              <Box>
                <Text mb={2}>当天摘要</Text>
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="输入当天摘要（例如：今天和夏夏一起去了西湖边散步）"
                />
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={handleGenerate} isLoading={generating} loadingText="生成中...">
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
            <Button colorScheme="blue" mr={3} onClick={handleSaveEdit}>
              保存
            </Button>
            <Button variant="ghost" onClick={onEditClose}>
              取消
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default DayPage
