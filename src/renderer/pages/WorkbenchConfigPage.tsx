import { useEffect, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Button,
  Card,
  CardBody,
  FormControl,
  FormLabel,
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
  const { currentProject, config, saving, error, saveConfig, markDirty, clearDirty } = useWorkbenchStore()
  const [genre, setGenre] = useState('')
  const [tone, setTone] = useState('')
  const [targetWords, setTargetWords] = useState('')
  const [contextBudget, setContextBudget] = useState('')
  const [settings, setSettings] = useState('{}')

  useEffect(() => {
    if (!config) return
    setGenre(config.genre)
    setTone(config.tone)
    setTargetWords(config.target_words?.toString() ?? '')
    setContextBudget(config.context_budget?.toString() ?? '')
    setSettings(JSON.stringify(config.settings, null, 2))
  }, [config])

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
