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
} from '@chakra-ui/react'
import { useFragmentStore } from '../stores/fragmentStore'

function FragmentPage() {
  const [slug, setSlug] = useState('')
  const [origin, setOrigin] = useState('user')
  const [mood, setMood] = useState('positive')
  const [content, setContent] = useState('')
  const { fragments, loading, error, fetchFragments, recordFragment, updateFragment, deleteFragment } = useFragmentStore()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const toast = useToast()

  useEffect(() => {
    if (slug) {
      fetchFragments(slug)
    }
  }, [slug, fetchFragments])

  const handleRecord = async () => {
    try {
      await recordFragment(slug, origin, mood, content)
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
    try {
      await updateFragment(slug, fragmentId, content)
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
    try {
      await deleteFragment(slug, fragmentId)
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
                <Text mb={2}>角色标识</Text>
                <Textarea
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="输入角色标识"
                />
              </Box>
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
