import { useState } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
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
  VStack,
} from '@chakra-ui/react'
import { FaTrash } from 'react-icons/fa'
import { WorkbenchEmpty, WorkbenchError, WorkbenchPage } from '../components/WorkbenchPrimitives'
import { useWorkbenchStore } from '../stores/workbenchStore'

export type LibraryMode = 'characters' | 'worldview' | 'organizations' | 'materials'

interface LibraryForm {
  first: string
  second: string
  third: string
}

const emptyForm: LibraryForm = { first: '', second: '', third: '' }

const metadata: Record<LibraryMode, { eyebrow: string; title: string; description: string; first: string; second: string; third: string }> = {
  characters: { eyebrow: 'CAST', title: '角色', description: '维护角色卡、角色职责和与旧 Crush 资料的映射边界。', first: '角色名', second: '叙事职责', third: '角色笔记' },
  worldview: { eyebrow: 'WORLD', title: '世界观', description: '把地点、规则、时代和其他稳定设定整理成可选上下文。', first: '分类', second: '条目标题', third: '设定内容' },
  organizations: { eyebrow: 'FACTIONS', title: '组织', description: '记录组织的目标、资源和叙事作用，并供关系图谱使用。', first: '组织名', second: '一句话定位', third: '组织说明' },
  materials: { eyebrow: 'MATERIALS', title: '故事素材库', description: '把旧 Fragment 或新写的片段沉淀成可选择的长篇创作素材。', first: '素材标题', second: '素材类型', third: '素材正文' },
}

function WorkbenchLibraryPage({ mode }: { mode: LibraryMode }) {
  const info = metadata[mode]
  const store = useWorkbenchStore()
  const [form, setForm] = useState<LibraryForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (!form.first.trim() || !form.second.trim()) {
      setFormError(`${info.first}和${info.second}不能为空。`)
      return
    }
    setFormError(null)
    try {
      if (mode === 'characters') await store.createCharacter({ name: form.first.trim(), role: form.second.trim(), notes: form.third.trim() })
      if (mode === 'worldview') await store.createWorldviewEntry({ category: form.first.trim(), title: form.second.trim(), content: form.third.trim() })
      if (mode === 'organizations') await store.createOrganization({ name: form.first.trim(), description: `${form.second.trim()}\n${form.third.trim()}` })
      if (mode === 'materials') await store.createSourceMaterial({ title: form.first.trim(), material_type: form.second.trim(), content: form.third.trim() })
      setForm(emptyForm)
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : String(submitError))
    }
  }

  if (!store.currentProject) {
    return <WorkbenchPage eyebrow={info.eyebrow} title={info.title} description={info.description}><Alert status="info"><AlertIcon />请先选择一个创作项目。</Alert></WorkbenchPage>
  }

  const items = mode === 'characters'
    ? store.characters
    : mode === 'worldview'
      ? store.worldviewEntries
      : mode === 'organizations'
        ? store.organizations
        : store.sourceMaterials

  return (
    <WorkbenchPage eyebrow={info.eyebrow} title={info.title} description={info.description}>
      <WorkbenchError message={store.error ?? formError} />
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
        <Card>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              <Text fontWeight="bold">新增{info.title === '故事素材库' ? '素材' : info.title.slice(0, -1)}</Text>
              <FormControl><FormLabel>{info.first}</FormLabel><Input value={form.first} onChange={(event) => setForm({ ...form, first: event.target.value })} /></FormControl>
              <FormControl><FormLabel>{info.second}</FormLabel><Input value={form.second} onChange={(event) => setForm({ ...form, second: event.target.value })} /></FormControl>
              <FormControl><FormLabel>{info.third}</FormLabel><Textarea value={form.third} onChange={(event) => setForm({ ...form, third: event.target.value })} minH="150px" /></FormControl>
              <Button colorScheme="cinnabar" isLoading={store.saving} onClick={() => void submit()}>保存到项目</Button>
            </VStack>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            {items.length === 0 ? <WorkbenchEmpty title="这里还没有内容" description="先新增一条记录，之后它就能被大纲和 Agent 选择为上下文。" /> : <VStack align="stretch" spacing={3}>{items.map((item) => <LibraryItem key={item.id} mode={mode} item={item as unknown as Record<string, unknown>} onDelete={() => void removeItem(mode, item.id, store)} />)}</VStack>}
          </CardBody>
        </Card>
      </SimpleGrid>
    </WorkbenchPage>
  )
}

function LibraryItem({ mode, item, onDelete }: { mode: LibraryMode; item: Record<string, unknown>; onDelete: () => void }) {
  const title = mode === 'characters' || mode === 'organizations' ? String(item.name ?? '') : String(item.title ?? '')
  const description = mode === 'characters'
    ? `${String(item.role ?? '未设置职责')}\n${String(item.notes ?? '')}`
    : mode === 'worldview'
      ? `${String(item.category ?? '未分类')}\n${String(item.content ?? '')}`
      : mode === 'organizations'
        ? String(item.description ?? '')
        : String(item.content ?? '')
  const version = typeof item.version === 'number' ? item.version : 1
  return <Card variant="outline"><CardBody><HStack align="flex-start" justify="space-between" gap={4}><Stack spacing={1} minW={0}><HStack><Text fontWeight="bold">{title}</Text><Badge colorScheme="gray">v{version}</Badge></HStack><Text whiteSpace="pre-wrap" color="ink.600" fontSize="sm" noOfLines={5}>{description || '暂无说明'}</Text></Stack><Button size="sm" variant="ghost" colorScheme="red" leftIcon={<FaTrash />} onClick={onDelete}>删除</Button></HStack></CardBody></Card>
}

async function removeItem(mode: LibraryMode, id: string, store: ReturnType<typeof useWorkbenchStore.getState>): Promise<void> {
  const confirmed = window.confirm('确认删除这条记录？删除后关系和大纲引用可能需要重新选择。')
  if (!confirmed) return
  if (mode === 'characters') await store.deleteCharacter(id)
  if (mode === 'worldview') await store.deleteWorldviewEntry(id)
  if (mode === 'organizations') await store.deleteOrganization(id)
  if (mode === 'materials') await store.deleteSourceMaterial(id)
}

export default WorkbenchLibraryPage
