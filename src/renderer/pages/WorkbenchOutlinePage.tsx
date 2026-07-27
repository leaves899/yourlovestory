import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
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
import { FaLock, FaPlus, FaSave, FaUnlock } from 'react-icons/fa'
import { WorkbenchEmpty, WorkbenchError, WorkbenchPage, outlineStatusLabel, statusColor } from '../components/WorkbenchPrimitives'
import { useWorkbenchStore } from '../stores/workbenchStore'

interface VolumeDraft {
  title: string
  synopsis: string
  theme: string
  conflict: string
  ending: string
}

const emptyVolumeDraft: VolumeDraft = { title: '', synopsis: '', theme: '', conflict: '', ending: '' }

function WorkbenchOutlinePage() {
  const store = useWorkbenchStore()
  const [selectedVolumeId, setSelectedVolumeId] = useState('')
  const [volumeTitle, setVolumeTitle] = useState('')
  const [volumeSynopsis, setVolumeSynopsis] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [chapterSummary, setChapterSummary] = useState('')
  const [chapterNumber, setChapterNumber] = useState('')
  const [outlineDraft, setOutlineDraft] = useState<VolumeDraft>(emptyVolumeDraft)

  useEffect(() => {
    const firstVolume = store.volumes[0]
    if (!selectedVolumeId && firstVolume) setSelectedVolumeId(firstVolume.id)
    if (selectedVolumeId && !store.volumes.some((volume) => volume.id === selectedVolumeId)) setSelectedVolumeId(firstVolume?.id ?? '')
  }, [selectedVolumeId, store.volumes])

  const selectedVolume = store.volumes.find((volume) => volume.id === selectedVolumeId) ?? null
  const selectedOutline = store.volumeOutlines.find((outline) => outline.volume_id === selectedVolumeId) ?? null
  const selectedChapters = useMemo(() => store.chapterOutlines.filter((outline) => outline.volume_id === selectedVolumeId), [selectedVolumeId, store.chapterOutlines])

  useEffect(() => {
    if (!selectedVolume) return
    setVolumeTitle(selectedVolume.title)
    setVolumeSynopsis(selectedVolume.synopsis)
    setOutlineDraft(selectedOutline ? {
      title: selectedVolume.title,
      synopsis: selectedOutline.summary,
      theme: selectedOutline.theme,
      conflict: selectedOutline.main_conflict,
      ending: selectedOutline.ending,
    } : {
      ...emptyVolumeDraft,
      title: selectedVolume.title,
      synopsis: selectedVolume.synopsis,
    })
  }, [selectedOutline, selectedVolume])

  const createVolume = async (): Promise<void> => {
    if (!volumeTitle.trim()) return
    await store.createVolume({
      volume_number: store.volumes.length + 1,
      title: volumeTitle.trim(),
      synopsis: volumeSynopsis.trim(),
      sort_order: store.volumes.length,
    })
    setVolumeTitle('')
    setVolumeSynopsis('')
  }

  const saveVolume = async (): Promise<void> => {
    if (!selectedVolume || selectedOutline?.status === 'locked') return
    if (selectedVolume.title !== outlineDraft.title || selectedVolume.synopsis !== outlineDraft.synopsis) {
      await store.updateVolume(selectedVolume.id, { title: outlineDraft.title, synopsis: outlineDraft.synopsis })
    }
    if (selectedOutline) {
      await store.updateVolumeOutline(selectedOutline.id, {
        summary: outlineDraft.synopsis,
        theme: outlineDraft.theme,
        main_conflict: outlineDraft.conflict,
        ending: outlineDraft.ending,
      })
    } else {
      await store.createVolumeOutline({
        volume_id: selectedVolume.id,
        summary: outlineDraft.synopsis,
        theme: outlineDraft.theme,
        main_conflict: outlineDraft.conflict,
        ending: outlineDraft.ending,
      })
    }
  }

  const createChapter = async (): Promise<void> => {
    if (!selectedVolume || !chapterTitle.trim()) return
    const nextNumber = Number(chapterNumber) || selectedChapters.length + 1
    await store.createChapterOutline({
      volume_id: selectedVolume.id,
      chapter_number: nextNumber,
      sort_order: selectedChapters.length,
      title: chapterTitle.trim(),
      summary: chapterSummary.trim(),
    })
    setChapterTitle('')
    setChapterSummary('')
    setChapterNumber('')
  }

  if (!store.currentProject) {
    return <WorkbenchPage eyebrow="OUTLINE" title="卷章大纲" description="先选择项目，再组织卷、章和稳定的生成边界。"><Alert status="info"><AlertIcon />请先选择一个创作项目。</Alert></WorkbenchPage>
  }

  return (
    <WorkbenchPage eyebrow="STRUCTURE" title="卷章大纲" description="大纲可以反复保存为草稿，确认后才允许生成，锁定后用于保护稳定上下文。版本不一致时会显示冲突提示。">
      <WorkbenchError message={store.error} />
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
        <Card>
          <CardHeader><HStack justify="space-between"><Text fontWeight="bold">卷</Text><Badge>{store.volumes.length}</Badge></HStack></CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={2}>
              {store.volumes.map((volume) => <Button key={volume.id} variant={volume.id === selectedVolumeId ? 'solid' : 'ghost'} colorScheme={volume.id === selectedVolumeId ? 'cinnabar' : 'ink'} justifyContent="flex-start" onClick={() => setSelectedVolumeId(volume.id)}><Stack align="flex-start" spacing={0}><Text>卷 {volume.volume_number} · {volume.title}</Text><Text fontSize="xs" opacity={0.72}>{volume.status}</Text></Stack></Button>)}
              {store.volumes.length === 0 && <Text color="ink.500" fontSize="sm">还没有卷。</Text>}
              <Divider my={2} />
              <FormControl><FormLabel fontSize="sm">新卷标题</FormLabel><Input size="sm" value={volumeTitle} onChange={(event) => setVolumeTitle(event.target.value)} data-testid="new-volume-title" /></FormControl>
              <FormControl><FormLabel fontSize="sm">卷简介</FormLabel><Textarea size="sm" value={volumeSynopsis} onChange={(event) => setVolumeSynopsis(event.target.value)} /></FormControl>
              <Button size="sm" leftIcon={<FaPlus />} colorScheme="cinnabar" isLoading={store.saving} isDisabled={store.saving} onClick={() => void createVolume()}>新增卷</Button>
            </VStack>
          </CardBody>
        </Card>

        {!selectedVolume ? (
          <WorkbenchEmpty
            title="选择或新增一卷"
            description="卷是章节和卷大纲的父级边界。"
            actionLabel="填写新卷"
            onAction={() => document.querySelector<HTMLInputElement>('[data-testid="new-volume-title"]')?.focus()}
            secondaryActionLabel="返回黄金路径"
            onSecondaryAction={() => { window.location.hash = '#/workbench/first-chapter' }}
          />
        ) : <Stack spacing={5}>
          <Card>
            <CardHeader><HStack justify="space-between"><Text fontWeight="bold">卷大纲 · {selectedVolume.title}</Text>{selectedOutline && <Badge colorScheme={statusColor(selectedOutline.status)}>{outlineStatusLabel(selectedOutline.status)}</Badge>}</HStack></CardHeader>
            <CardBody>
              <Stack spacing={4}>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl><FormLabel>卷标题</FormLabel><Input value={outlineDraft.title} isDisabled={selectedOutline?.status === 'locked'} onChange={(event) => { setOutlineDraft({ ...outlineDraft, title: event.target.value }); store.markDirty() }} /></FormControl>
                  <FormControl><FormLabel>主题</FormLabel><Input value={outlineDraft.theme} isDisabled={selectedOutline?.status === 'locked'} onChange={(event) => { setOutlineDraft({ ...outlineDraft, theme: event.target.value }); store.markDirty() }} /></FormControl>
                </SimpleGrid>
                <FormControl><FormLabel>卷简介</FormLabel><Textarea value={outlineDraft.synopsis} isDisabled={selectedOutline?.status === 'locked'} onChange={(event) => { setOutlineDraft({ ...outlineDraft, synopsis: event.target.value }); store.markDirty() }} /></FormControl>
                <FormControl><FormLabel>主要冲突</FormLabel><Textarea value={outlineDraft.conflict} isDisabled={selectedOutline?.status === 'locked'} onChange={(event) => { setOutlineDraft({ ...outlineDraft, conflict: event.target.value }); store.markDirty() }} /></FormControl>
                <FormControl><FormLabel>结尾</FormLabel><Textarea value={outlineDraft.ending} isDisabled={selectedOutline?.status === 'locked'} onChange={(event) => { setOutlineDraft({ ...outlineDraft, ending: event.target.value }); store.markDirty() }} /></FormControl>
                <HStack flexWrap="wrap"><Button leftIcon={<FaSave />} colorScheme="cinnabar" isDisabled={selectedOutline?.status === 'locked' || store.saving} isLoading={store.saving} onClick={() => void saveVolume()}>保存卷大纲</Button>{selectedOutline?.status === 'draft' && <Button isLoading={store.saving} isDisabled={store.saving} onClick={() => void store.confirmVolumeOutline(selectedOutline.id)}>确认</Button>}{selectedOutline?.status === 'confirmed' && <Button leftIcon={<FaLock />} isLoading={store.saving} isDisabled={store.saving} onClick={() => void store.lockVolumeOutline(selectedOutline.id)}>锁定</Button>}{selectedOutline?.status === 'locked' && <Button leftIcon={<FaUnlock />} variant="outline" isLoading={store.saving} isDisabled={store.saving} onClick={() => void store.unlockVolumeOutline(selectedOutline.id)}>解锁</Button>}</HStack>
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><HStack justify="space-between"><Text fontWeight="bold">章节大纲</Text><Badge>{selectedChapters.length}</Badge></HStack></CardHeader>
            <CardBody>
              <Stack spacing={4}>
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                  <FormControl><FormLabel fontSize="sm">章节号</FormLabel><Input type="number" value={chapterNumber} onChange={(event) => setChapterNumber(event.target.value)} placeholder="自动递增" /></FormControl>
                  <FormControl><FormLabel fontSize="sm">章节标题</FormLabel><Input value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} /></FormControl>
                  <FormControl><FormLabel fontSize="sm">章节摘要</FormLabel><Input value={chapterSummary} onChange={(event) => setChapterSummary(event.target.value)} /></FormControl>
                </SimpleGrid>
                <Button alignSelf="flex-start" size="sm" leftIcon={<FaPlus />} isLoading={store.saving} isDisabled={store.saving} onClick={() => void createChapter()}>新增章节草稿</Button>
                {selectedChapters.length === 0 ? <Text color="ink.500">还没有章节大纲。</Text> : <VStack align="stretch" spacing={3}>{selectedChapters.map((chapter) => <ChapterOutlineCard key={chapter.id} chapter={chapter} store={store} />)}</VStack>}
              </Stack>
            </CardBody>
          </Card>
        </Stack>}
      </SimpleGrid>
    </WorkbenchPage>
  )
}

function ChapterOutlineCard({ chapter, store }: { chapter: ReturnType<typeof useWorkbenchStore.getState>['chapterOutlines'][number]; store: ReturnType<typeof useWorkbenchStore.getState> }) {
  const edit = async (): Promise<void> => {
    if (chapter.status === 'locked') return
    const title = window.prompt('章节标题', chapter.title)
    if (!title?.trim()) return
    const summary = window.prompt('章节摘要', chapter.summary) ?? chapter.summary
    await store.updateChapterOutline(chapter.id, { title: title.trim(), summary })
  }
  return <Card variant="outline"><CardBody><HStack align="flex-start" justify="space-between" gap={4}><Stack spacing={1}><HStack><Text fontWeight="bold">第 {chapter.chapter_number} 章 · {chapter.title}</Text><Badge colorScheme={statusColor(chapter.status)}>{outlineStatusLabel(chapter.status)}</Badge></HStack><Text color="ink.600" fontSize="sm">{chapter.summary || '暂无摘要'}</Text><Text fontSize="xs" color="ink.500">目的：{chapter.purpose || '未设置'} · 结尾钩子：{chapter.ending_hook || '未设置'}</Text></Stack><HStack flexShrink={0}><Button size="sm" variant="outline" onClick={() => void edit()} isDisabled={chapter.status === 'locked' || store.saving}>编辑</Button>{chapter.status === 'draft' && <Button size="sm" isLoading={store.saving} isDisabled={store.saving} onClick={() => void store.confirmChapterOutline(chapter.id)}>确认</Button>}{chapter.status === 'confirmed' && <Button size="sm" leftIcon={<FaLock />} isLoading={store.saving} isDisabled={store.saving} onClick={() => void store.lockChapterOutline(chapter.id)}>锁定</Button>}{chapter.status === 'locked' && <Button size="sm" leftIcon={<FaUnlock />} variant="outline" isLoading={store.saving} isDisabled={store.saving} onClick={() => void store.unlockChapterOutline(chapter.id)}>解锁</Button>}</HStack></HStack></CardBody></Card>
}

export default WorkbenchOutlinePage
