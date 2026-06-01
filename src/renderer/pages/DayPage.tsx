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
} from '@chakra-ui/react'
import { useDayStore } from '../stores/dayStore'

function DayPage() {
  const [slug, setSlug] = useState('')
  const [dayNumber, setDayNumber] = useState(1)
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const { days, loading, error, fetchDays, generateDay, updateDay, deleteDay } = useDayStore()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const toast = useToast()

  useEffect(() => {
    if (slug) {
      fetchDays(slug)
    }
  }, [slug, fetchDays])

  const handleGenerate = async () => {
    try {
      await generateDay(slug, dayNumber, summary)
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
    }
  }

  const handleUpdate = async (dayNumber: number, content: string) => {
    try {
      await updateDay(slug, dayNumber, content)
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

  const handleDelete = async (dayNumber: number) => {
    try {
      await deleteDay(slug, dayNumber)
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

  return (
    <Box>
      <Heading mb={4}>日常写作</Heading>

      <Button onClick={onOpen} mb={4}>
        生成日常写作
      </Button>

      <Stack spacing={4}>
        {days.map((day) => (
          <Card key={day.day_number}>
            <CardHeader>
              <Heading size="md">Day {day.day_number}</Heading>
            </CardHeader>
            <CardBody>
              <Text>{day.content}</Text>
              <Button
                mt={4}
                onClick={() => handleUpdate(day.day_number, day.content)}
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
                <Text mb={2}>角色标识</Text>
                <Textarea
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="输入角色标识"
                />
              </Box>
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
                  placeholder="输入当天摘要"
                />
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={handleGenerate}>
              生成
            </Button>
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default DayPage
