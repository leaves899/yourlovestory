import { useState, useEffect } from 'react'
import {
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Stack,
  Text,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Input,
} from '@chakra-ui/react'
import { useCrushStore } from '../stores/crushStore'
import { useAppStore } from '../stores/appStore'
import { buildDefaultCrushSlug } from '../../shared/crush/slug'
import { InkPage } from '../components/InkDesign'

function CrushPage() {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [slug, setSlug] = useState('')
  const [editingCrush, setEditingCrush] = useState<{ slug: string; name: string; nickname: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const { items: crushes, fetch: fetchCrushes, create: createCrush, update: updateCrush, delete: deleteCrush } = useCrushStore()
  const { fetchCrushes: refreshAppCrushes, setActiveSlug } = useAppStore()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure()
  const toast = useToast()

  useEffect(() => {
    fetchCrushes()
  }, [fetchCrushes])

  const handleCreate = async () => {
    try {
      const response = await createCrush({
        name,
        nickname,
        slug: slug.trim() || buildDefaultCrushSlug(name, nickname),
      })
      if (!response.success || !response.data) {
        throw new Error(response.errors?.[0] || '创建失败')
      }
      const created = response.data as { slug: string }
      await refreshAppCrushes()
      setActiveSlug(created.slug)
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
      await refreshAppCrushes()
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
      const result = await deleteCrush(slug)
      if (result.success) {
        await refreshAppCrushes()
        toast({
          title: '删除成功',
          status: 'success',
          duration: 3000,
        })
        // 删除成功后重新加载列表
        fetchCrushes()
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

  return (
    <InkPage
      title="角色管理"
      eyebrow="CHARACTERS"
      subtitle="维护这段故事里的角色资料，角色切换后会影响日记、碎片和关系进度。"
      action={<Button onClick={onOpen}>创建角色</Button>}
    >
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
                colorScheme="cinnabar"
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
                <Text mb={2}>角色名</Text>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="你想怎么称呼 ta"
                />
              </Box>
              <Box>
                <Text mb={2}>平时称呼</Text>
                <Input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="例如：夏夏、小周、阿琳"
                />
              </Box>
              <Box>
                <Text mb={2}>标识</Text>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="留空则自动生成"
                />
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="cinnabar" mr={3} onClick={handleCreate}>
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
                <Text mb={2}>角色名</Text>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="输入角色名"
                />
              </Box>
              <Box>
                <Text mb={2}>平时称呼</Text>
                <Input
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  placeholder="输入平时称呼"
                />
              </Box>
            </Stack>
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

export default CrushPage
