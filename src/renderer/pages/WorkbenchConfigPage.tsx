import { useEffect, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Button,
  Card,
  CardBody,
  FormControl,
  FormLabel,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { WorkbenchError, WorkbenchPage } from '../components/WorkbenchPrimitives'
import { useWorkbenchStore } from '../stores/workbenchStore'
import type { JsonObject } from '../../shared/novelProject'

function WorkbenchConfigPage() {
  const { currentProject, config, saving, error, saveConfig, markDirty, clearDirty, refreshProjectData } = useWorkbenchStore()
  const [genre, setGenre] = useState('')
  const [tone, setTone] = useState('')
  const [targetWords, setTargetWords] = useState('')
  const [contextBudget, setContextBudget] = useState('')
  const [settings, setSettings] = useState('{}')
  const [credentialInput, setCredentialInput] = useState('')
  const [credentialConfigured, setCredentialConfigured] = useState(false)
  const [credentialMessage, setCredentialMessage] = useState('')
  const [credentialBusy, setCredentialBusy] = useState(false)

  useEffect(() => {
    if (!config) return
    setGenre(config.genre)
    setTone(config.tone)
    setTargetWords(config.target_words?.toString() ?? '')
    setContextBudget(config.context_budget?.toString() ?? '')
    setSettings(JSON.stringify(config.settings, null, 2))
  }, [config])

  useEffect(() => {
    if (!currentProject) return
    void window.electronAPI.getLlmCredentialStatus({ scope: 'project', projectId: currentProject.id })
      .then((response) => {
        setCredentialConfigured(response.success && response.data?.configured === true)
        setCredentialMessage(
          response.success
            ? response.data?.error?.message ?? ''
            : response.error?.message ?? '无法读取凭据状态。',
        )
      })
      .catch(() => setCredentialMessage('无法读取凭据状态。'))
  }, [currentProject])

  const saveCredential = async (): Promise<void> => {
    if (!currentProject || !credentialInput.trim()) return
    setCredentialBusy(true)
    setCredentialMessage('')
    try {
      const response = await window.electronAPI.saveLlmCredential(
        { scope: 'project', projectId: currentProject.id },
        credentialInput.trim(),
      )
      setCredentialConfigured(response.success)
      if (response.success) await refreshProjectData(currentProject.id)
      setCredentialMessage(response.success ? '项目凭据已安全保存。' : response.error?.message ?? '保存凭据失败。')
    } finally {
      setCredentialInput('')
      setCredentialBusy(false)
    }
  }

  const testCredential = async (): Promise<void> => {
    if (!currentProject) return
    setCredentialBusy(true)
    try {
      const response = await window.electronAPI.testLlmCredential({ scope: 'project', projectId: currentProject.id })
      setCredentialMessage(response.success ? response.data?.message ?? '连接测试成功。' : response.error?.message ?? '连接测试失败。')
    } finally {
      setCredentialBusy(false)
    }
  }

  const deleteCredential = async (): Promise<void> => {
    if (!currentProject || !window.confirm('删除后该项目无法继续使用此凭据，确认删除吗？')) return
    setCredentialBusy(true)
    try {
      const response = await window.electronAPI.deleteLlmCredential({ scope: 'project', projectId: currentProject.id })
      if (response.success) {
        const status = await window.electronAPI.getLlmCredentialStatus({
          scope: 'project',
          projectId: currentProject.id,
        })
        setCredentialConfigured(status.success && status.data?.configured === true)
        await refreshProjectData(currentProject.id)
      }
      setCredentialMessage(response.success ? '项目凭据已删除。' : response.error?.message ?? '删除凭据失败。')
    } finally {
      setCredentialBusy(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!currentProject) return
    let parsedSettings: JsonObject = {}
    try {
      const value: unknown = JSON.parse(settings || '{}')
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('设置必须是 JSON 对象')
      parsedSettings = value as JsonObject
    } catch {
      return
    }
    await saveConfig({
      genre: genre.trim(),
      tone: tone.trim(),
      target_words: parsePositive(targetWords),
      context_budget: parsePositive(contextBudget),
      settings: parsedSettings,
    })
    clearDirty()
  }

  if (!currentProject) {
    return <WorkbenchPage eyebrow="CONFIG" title="项目配置" description="先选择一个项目，再设置创作基调和上下文预算。"><Alert status="info"><AlertIcon />请先在项目页创建或选择项目。</Alert></WorkbenchPage>
  }

  return (
    <WorkbenchPage eyebrow="PROJECT CONFIG" title="项目配置" description="这些配置会参与大纲上下文和章节生成。保存时使用版本号校验，避免覆盖其他编辑。">
      <WorkbenchError message={error} />
      <Card maxW="900px">
        <CardBody>
          <Stack spacing={5}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl><FormLabel>题材</FormLabel><Input value={genre} onChange={(event) => { setGenre(event.target.value); markDirty() }} placeholder="例如：都市奇幻" /></FormControl>
              <FormControl><FormLabel>叙事语气</FormLabel><Input value={tone} onChange={(event) => { setTone(event.target.value); markDirty() }} placeholder="例如：克制、温暖、带悬念" /></FormControl>
              <FormControl><FormLabel>目标字数</FormLabel><Input type="number" value={targetWords} onChange={(event) => { setTargetWords(event.target.value); markDirty() }} placeholder="每章目标字数" /></FormControl>
              <FormControl><FormLabel>上下文预算</FormLabel><Input type="number" value={contextBudget} onChange={(event) => { setContextBudget(event.target.value); markDirty() }} placeholder="Token 预算" /></FormControl>
            </SimpleGrid>
            <FormControl><FormLabel>扩展设置 JSON</FormLabel><Textarea minH="180px" fontFamily="mono" value={settings} onChange={(event) => { setSettings(event.target.value); markDirty() }} /></FormControl>
            <Card variant="outline"><CardBody><Stack spacing={3}><Text fontWeight="bold">项目模型凭据</Text><Text fontSize="sm" color={credentialConfigured ? 'green.600' : 'orange.600'}>{credentialConfigured ? '已安全保存，不会回填或显示完整 API Key。' : '尚未配置，保存后仅由主进程使用。'}</Text><Text fontSize="sm" color="ink.500">使用自定义 HTTPS 模型接口时，API Key 会发送到你保存并绑定的该服务地址；renderer 不能临时覆盖地址。</Text><FormControl><FormLabel fontSize="sm">保存或替换 API Key</FormLabel><Input type="password" value={credentialInput} onChange={(event) => setCredentialInput(event.target.value)} autoComplete="off" placeholder="仅用于本次安全保存" /></FormControl><HStack flexWrap="wrap"><Button size="sm" colorScheme="cinnabar" isLoading={credentialBusy} onClick={() => void saveCredential()} isDisabled={!credentialInput.trim()}>保存或替换</Button><Button size="sm" variant="outline" isLoading={credentialBusy} onClick={() => void testCredential()} isDisabled={!credentialConfigured}>测试连接</Button><Button size="sm" variant="outline" colorScheme="red" isLoading={credentialBusy} onClick={() => void deleteCredential()} isDisabled={!credentialConfigured}>删除凭据</Button></HStack>{credentialMessage && <Text fontSize="sm" color="ink.600">{credentialMessage}</Text>}</Stack></CardBody></Card>
            <Alert status="info"><AlertIcon /><Text>亲密内容默认关闭。只有项目目录中明确启用配置时，相关 Agent 工具才会处理对应内容。</Text></Alert>
            <Button alignSelf="flex-start" colorScheme="cinnabar" isLoading={saving} onClick={() => void save()} data-testid="save-project-config">保存配置</Button>
          </Stack>
        </CardBody>
      </Card>
    </WorkbenchPage>
  )
}

function parsePositive(value: string): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default WorkbenchConfigPage
