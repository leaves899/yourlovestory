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
  Select,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from '@chakra-ui/react'
import { useFragmentStore } from '../stores/fragmentStore'
import { useAppStore } from '../stores/appStore'

function FragmentPage() {
  const [origin, setOrigin] = useState('user')
  const [mood, setMood] = useState('positive')
  const [content, setContent] = useState('')
  const { items: fragments, loading, error, fetch: fetchFragments, record: recordFragment, update: updateFragment, delete: deleteFragment } = useFragmentStore()
  const { activeSlug } = useAppStore()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const toast = useToast()

  useEffect(() => {
    if (activeSlug) {
      fetchFragments(activeSlug)
    }
  }, [activeSlug, fetchFragments])

  const handleRecord = async () => {
    if (!activeSlug) return
    try {
      await recordFragment(activeSlug, origin, mood, content)
      toast({
        title: '记录成功',
        status: 'success',
        duration: 3000,
      })
      onClose()
    } catch (error: any) {
      toast({
        title: '记录失败',
        description: error.message,
        status: 'error',
        duration: 3000,
      })
    }
  }

  const handleUpdate = async (fragmentId: string, content: string) => {
    if (!activeSlug) return
    try {
      await updateFragment(activeSlug, fragmentId, content)
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

  const handleDelete = async (fragmentId: string) => {
    if (!activeSlug) return
    try {
      const result = await deleteFragment(activeSlug, fragmentId)
      if (result.success) {
        toast({
          title: '删除成功',
          status: 'success',
          duration: 3000,
        })
        // 删除成功后重新加载列表
        fetchFragments(activeSlug)
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
      <Box>
        <Heading mb={4}>碎片日记</Heading>
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <Box>
            <AlertTitle>请选择角色</AlertTitle>
            <AlertDescription>
              请在侧边栏选择一个角色开始记录碎片。
            </AlertDescription>
          </Box>
        </Alert>
      </Box>
    )
  }

  return (
    <Box>
      <Heading mb={4}>碎片日记</Heading>

      <Button onClick={onOpen} mb={4}>
        记录碎片
      </Button>

      <Stack spacing={4}>
        {fragments.map((fragment) => (
          <Card key={fragment.id}>
            <CardHeader>
              <Heading size="md">{fragment.origin} - {fragment.mood}</Heading>
            </CardHeader>
            <CardBody>
              <Text>{fragment.content}</Text>
              <Button
                mt={4}
                onClick={() => handleUpdate(fragment.id, fragment.content)}
              >
                编辑
              </Button>
              <Button
                mt={4}
                ml={2}
                colorScheme="red"
                onClick={() => handleDelete(fragment.id)}
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
          <ModalHeader>记录碎片</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <Box>
                <Text mb={2}>来源</Text>
                <Select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                  <option value="user">用户</option>
                  <option value="crush">crush</option>
                  <option value="ambient">环境</option>
                </Select>
              </Box>
              <Box>
                <Text mb={2}>情绪</Text>
                <Select value={mood} onChange={(e) => setMood(e.target.value)}>
                  <option value="positive">开心</option>
                  <option value="negative">在意</option>
                  <option value="neutral">日常</option>
                  <option value="mixed">心情复杂</option>
                </Select>
              </Box>
              <Box>
                <Text mb={2}>内容</Text>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="输入碎片内容"
                />
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={handleRecord}>
              记录
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

export default FragmentPage
