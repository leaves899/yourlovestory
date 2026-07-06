import { useState, useEffect } from 'react'
import {
  Box,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  HStack,
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
import { useNavigate } from 'react-router-dom'
import { useFragmentStore } from '../stores/fragmentStore'
import { useAppStore } from '../stores/appStore'
import { InkPage } from '../components/InkDesign'

function FragmentPage() {
  const navigate = useNavigate()
  const [origin, setOrigin] = useState('user')
  const [mood, setMood] = useState('positive')
  const [content, setContent] = useState('')
  const { items: fragments, fetch: fetchFragments, record: recordFragment, update: updateFragment, delete: deleteFragment } = useFragmentStore()
  const { activeSlug, needsOnboarding } = useAppStore()
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
      <InkPage
        data-testid="fragment-page"
        title="碎片日记"
        titleTestId="fragment-page-title"
        eyebrow="FRAGMENTS"
        subtitle="先记一句话、一个动作、一个眼神，之后再把它们织成完整叙事。"
      >
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <Box>
            <AlertTitle>{needsOnboarding() ? '先完成首次设置' : '请选择角色'}</AlertTitle>
            <AlertDescription>
              {needsOnboarding()
                ? '先创建角色并确认当前关系阶段，再回来记录第一条碎片，会更容易理解后续玩法。'
                : '请在侧边栏选择一个角色开始记录碎片。'}
            </AlertDescription>
            <Button
              mt={3}
              size="sm"
              colorScheme="cinnabar"
              onClick={() => navigate(needsOnboarding() ? '/onboarding' : '/')}
            >
              {needsOnboarding() ? '去完成首次设置' : '回到日常写作'}
            </Button>
          </Box>
        </Alert>
      </InkPage>
    )
  }

  return (
    <InkPage
      data-testid="fragment-page"
      title="碎片日记"
      titleTestId="fragment-page-title"
      eyebrow="FRAGMENTS"
      subtitle="用最小单位记录相处细节，给后续 Day 写作提供真实线索。"
      action={
        <Button onClick={onOpen} data-testid="open-record-fragment">
          记录碎片
        </Button>
      }
    >
      <Stack spacing={4}>
        {fragments.map((fragment) => (
          <Card key={fragment.id} borderLeft="4px solid" borderLeftColor="ink.400">
            <CardHeader>
              <HStack justify="space-between" align="center">
                <Heading size="md">{fragment.origin}</Heading>
                <Badge colorScheme="bamboo">{fragment.mood}</Badge>
              </HStack>
            </CardHeader>
            <CardBody>
              <Text color="ink.800" lineHeight="1.8">{fragment.content}</Text>
              <HStack mt={4} spacing={2}>
                <Button
                  variant="outline"
                  onClick={() => handleUpdate(fragment.id, fragment.content)}
                >
                  编辑
                </Button>
                <Button
                  variant="outline"
                  colorScheme="cinnabar"
                  onClick={() => handleDelete(fragment.id)}
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
          <ModalHeader>记录碎片</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <Box>
                <Text mb={2}>来源</Text>
                <Select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  data-testid="fragment-origin"
                >
                  <option value="user">用户</option>
                  <option value="crush">crush</option>
                  <option value="ambient">环境</option>
                </Select>
              </Box>
              <Box>
                <Text mb={2}>情绪</Text>
                <Select
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  data-testid="fragment-mood"
                >
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
                  data-testid="fragment-content"
                />
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="cinnabar" mr={3} onClick={handleRecord} data-testid="fragment-submit">
              记录
            </Button>
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </InkPage>
  )
}

export default FragmentPage
