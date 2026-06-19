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
import { useCrushStore } from '../stores/crushStore'

function CrushPage() {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [slug, setSlug] = useState('')
  const [editingCrush, setEditingCrush] = useState<{ slug: string; name: string; nickname: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const { items: crushes, loading, error, fetch: fetchCrushes, create: createCrush, update: updateCrush, delete: deleteCrush } = useCrushStore()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const toast = useToast()

  useEffect(() => {
    fetchCrushes()
  }, [fetchCrushes])

  const handleCreate = async () => {
    try {
      await createCrush(name, nickname, slug)
      toast({
        title: '创建成功',
        status: 'success',
        duration: 3000,
      })
      onClose()
    } catch (error: any) {
      toast({
        title: '创建失败',
        description: error.message,
        status: 'error',
        duration: 3000,
      })
    }
  }

  const handleEdit = (crush: { slug: string; name: string; nickname: string }) => {
    setEditingCrush(crush)
    setEditName(crush.name)
    setEditNickname(crush.nickname)
    onEditOpen()
  }

  const handleSaveEdit = async () => {
    if (!editingCrush) return
    try {
      await updateCrush(editingCrush.slug, editName, editNickname)
      toast({
        title: '更新成功',
        status: 'success',
        duration: 3000,
      })
      onEditClose()
      setEditingCrush(null)
    } catch (error: any) {
      toast({
        title: '更新失败',
        description: error.message,
        status: 'error',
        duration: 3000,
      })
    }
  }

  const handleDelete = async (slug: string) => {
    try {
      await deleteCrush(slug)
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
      <Heading mb={4}>角色管理</Heading>

      <Button onClick={onOpen} mb={4}>
        创建角色
      </Button>

      <Stack spacing={4}>
        {crushes.map((crush) => (
          <Card key={crush.slug}>
            <CardHeader>
              <Heading size="md">{crush.name} ({crush.nickname})</Heading>
            </CardHeader>
            <CardBody>
              <Text>标识: {crush.slug}</Text>
              <Button
                mt={4}
                onClick={() => handleEdit(crush)}
              >
                编辑
              </Button>
              <Button
                mt={4}
                ml={2}
                colorScheme="red"
                onClick={() => handleDelete(crush.slug)}
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
          <ModalHeader>创建角色</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <Box>
                <Text mb={2}>真实姓名</Text>
                <Textarea
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="输入真实姓名"
                />
              </Box>
              <Box>
                <Text mb={2}>昵称</Text>
                <Textarea
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="输入昵称"
                />
              </Box>
              <Box>
                <Text mb={2}>标识</Text>
                <Textarea
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="输入标识"
                />
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={handleCreate}>
              创建
            </Button>
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isEditOpen} onClose={onEditClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>编辑角色</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <Box>
                <Text mb={2}>真实姓名</Text>
                <Textarea
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="输入真实姓名"
                />
              </Box>
              <Box>
                <Text mb={2}>昵称</Text>
                <Textarea
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  placeholder="输入昵称"
                />
              </Box>
            </Stack>
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

export default CrushPage
