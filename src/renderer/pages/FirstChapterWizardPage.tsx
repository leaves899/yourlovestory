import { useMemo, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormControl,
  FormLabel,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { FirstChapterProgress } from '../components/FirstChapterProgress'
import { WorkflowCheckList } from '../components/WorkflowCheckList'
import { WorkflowStepCard } from '../components/WorkflowStepCard'
import { WorkbenchError, WorkbenchPage } from '../components/WorkbenchPrimitives'
import { useFirstChapterWorkflow } from '../hooks/useFirstChapterWorkflow'
import { useWorkbenchStore } from '../stores/workbenchStore'

function suggestSlug(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'my-novel'
}

function FirstChapterWizardPage() {
  const navigate = useNavigate()
  const store = useWorkbenchStore()
  const snapshot = useFirstChapterWorkflow()
  const [projectName, setProjectName] = useState('')
  const [slug, setSlug] = useState('')
  const [concept, setConcept] = useState('')
  const [genre, setGenre] = useState('')
  const [tone, setTone] = useState('')
  const [protagonistName, setProtagonistName] = useState('')
  const [coreCharacterName, setCoreCharacterName] = useState('')
  const [relationType, setRelationType] = useState('')
  const [relationDescription, setRelationDescription] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const firstVolume = useMemo(
    () => [...store.volumes].sort((left, right) => left.volume_number - right.volume_number)[0] ?? null,
    [store.volumes],
  )
  const firstVolumeOutline = firstVolume
    ? store.volumeOutlines.find((outline) => outline.volume_id === firstVolume.id) ?? null
    : null
  const firstChapterOutline = useMemo(
    () => firstVolume
      ? [...store.chapterOutlines]
        .filter((outline) => outline.volume_id === firstVolume.id)
        .sort((left, right) =>
          left.chapter_number - right.chapter_number || left.sort_order - right.sort_order,
        )[0] ?? null
      : null,
    [firstVolume, store.chapterOutlines],
  )
  const needsInitialDraft = store.worldviewEntries.length === 0 ||
    !firstVolume ||
    !firstVolumeOutline ||
    !firstChapterOutline

  const createProject = async (): Promise<void> => {
    if (!projectName.trim() || !slug.trim() || !concept.trim()) {
      setLocalError('项目名称、slug 和一句话故事概念都需要填写。')
      return
    }
    setLocalError(null)
    try {
      const project = await store.createProject({
        name: projectName.trim(),
        slug: slug.trim(),
        description: concept.trim(),
      })
      await store.saveConfig({ genre: genre.trim(), tone: tone.trim() })
      await store.refreshProjectData(project.id)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }

  const createCharactersAndRelation = async (): Promise<void> => {
    if (!protagonistName.trim() || !coreCharacterName.trim() || !relationType.trim()) {
      setLocalError('主角、核心角色和关系类型都需要填写。')
      return
    }
    setLocalError(null)
    try {
      const protagonist = store.characters.find((character) =>
        character.name === protagonistName.trim() &&
        ['protagonist', '主角', '主人公'].includes(character.role.trim()),
      ) ?? await store.createCharacter({
          name: protagonistName.trim(),
          role: 'protagonist',
        })
      const coreCharacter = store.characters.find((character) =>
        character.id !== protagonist.id && character.name === coreCharacterName.trim(),
      ) ?? await store.createCharacter({
          name: coreCharacterName.trim(),
          role: 'core',
        })
      const relationExists = store.relations.some((relation) =>
        relation.source_entity_type === 'character' &&
        relation.target_entity_type === 'character' &&
        (
          (
            relation.source_entity_id === protagonist.id &&
            relation.target_entity_id === coreCharacter.id
          ) ||
          (
            relation.source_entity_id === coreCharacter.id &&
            relation.target_entity_id === protagonist.id
          )
        ),
      )
      if (!relationExists) {
        await store.createRelation({
          source: { type: 'character', id: protagonist.id },
          target: { type: 'character', id: coreCharacter.id },
          relation_type: relationType.trim(),
          description: relationDescription.trim(),
        })
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }

  const saveExistingConcept = async (): Promise<void> => {
    if (!store.currentProject || !concept.trim()) {
      setLocalError('请先填写一句话故事概念。')
      return
    }
    setLocalError(null)
    try {
      await store.updateProject({ description: concept.trim() })
      if (genre.trim() || tone.trim()) {
        await store.saveConfig({ genre: genre.trim(), tone: tone.trim() })
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }

  const createInitialDraft = async (): Promise<void> => {
    const project = store.currentProject
    if (!project) return
    setLocalError(null)
    try {
      if (store.worldviewEntries.length === 0) {
        await store.createWorldviewEntry({
          category: '初始草案',
          title: '核心世界规则',
          content: `围绕「${project.description}」补充时代、地点和核心规则。`,
          metadata: { workflow: 'first-chapter-draft' },
        })
      }
      let volume = firstVolume
      if (!volume) {
        volume = await store.createVolume({
          volume_number: 1,
          title: '第一卷',
          synopsis: '首卷初始草案，请在确认前编辑。',
          status: 'planned',
          sort_order: 0,
        })
      }
      if (!store.volumeOutlines.some((outline) => outline.volume_id === volume.id)) {
        await store.createVolumeOutline({
          volume_id: volume.id,
          summary: `围绕「${project.description}」展开第一卷。`,
          theme: '待补充',
          main_conflict: '待补充',
          key_turning_points: [],
          ending: '待补充',
          metadata: { workflow: 'first-chapter-draft' },
        })
      }
      if (!store.chapterOutlines.some((outline) => outline.volume_id === volume.id)) {
        await store.createChapterOutline({
          volume_id: volume.id,
          chapter_number: 1,
          sort_order: 0,
          title: '第一章',
          summary: project.description,
          purpose: '',
          opening: '',
          conflict: '',
          key_events: [],
          ending: '',
          ending_hook: '',
          metadata: { workflow: 'first-chapter-draft' },
        })
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <WorkbenchPage
      eyebrow="FIRST CHAPTER"
      title="完成第一章"
      description="按顺序完成项目、人物、结构、生成和审阅。所有草案都需要由你确认。"
    >
      <WorkbenchError message={localError ?? store.error} />
      <Stack spacing={6}>
        <FirstChapterProgress />
        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={3}>
          {snapshot.steps.map((step, index) => <WorkflowStepCard key={step.id} step={step} index={index} />)}
        </SimpleGrid>

        {!store.currentProject && (
          <Card data-testid="wizard-project-step">
            <CardHeader><Text fontWeight="bold">1. 项目和故事概念</Text></CardHeader>
            <CardBody>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isRequired>
                  <FormLabel>项目名称</FormLabel>
                  <Input
                    value={projectName}
                    onChange={(event) => {
                      setProjectName(event.target.value)
                      if (!slug) setSlug(suggestSlug(event.target.value))
                    }}
                    data-testid="wizard-project-name"
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>slug</FormLabel>
                  <Input value={slug} onChange={(event) => setSlug(event.target.value)} data-testid="wizard-project-slug" />
                </FormControl>
                <FormControl isRequired gridColumn={{ md: '1 / -1' }}>
                  <FormLabel>一句话故事概念</FormLabel>
                  <Textarea value={concept} onChange={(event) => setConcept(event.target.value)} data-testid="wizard-concept" />
                </FormControl>
                <FormControl><FormLabel>题材（可选）</FormLabel><Input value={genre} onChange={(event) => setGenre(event.target.value)} /></FormControl>
                <FormControl><FormLabel>语气（可选）</FormLabel><Input value={tone} onChange={(event) => setTone(event.target.value)} /></FormControl>
              </SimpleGrid>
              <HStack mt={4}>
                <Button colorScheme="cinnabar" onClick={() => void createProject()} isLoading={store.saving} isDisabled={store.saving} data-testid="wizard-create-project">创建并继续</Button>
                <Button variant="outline" onClick={() => navigate('/workbench/projects')}>普通项目管理</Button>
              </HStack>
            </CardBody>
          </Card>
        )}

        {store.currentProject && !store.currentProject.description.trim() && (
          <Card data-testid="wizard-existing-concept-step">
            <CardHeader><Text fontWeight="bold">1. 补充现有项目的故事概念</Text></CardHeader>
            <CardBody>
              <Stack spacing={4}>
                <Alert status="info"><AlertIcon />继续使用「{store.currentProject.name}」，不会清空或重建已有数据。</Alert>
                <FormControl isRequired>
                  <FormLabel>一句话故事概念</FormLabel>
                  <Textarea value={concept} onChange={(event) => setConcept(event.target.value)} data-testid="wizard-existing-concept" />
                </FormControl>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl><FormLabel>题材（可选）</FormLabel><Input value={genre} onChange={(event) => setGenre(event.target.value)} /></FormControl>
                  <FormControl><FormLabel>语气（可选）</FormLabel><Input value={tone} onChange={(event) => setTone(event.target.value)} /></FormControl>
                </SimpleGrid>
                <Button alignSelf="flex-start" colorScheme="cinnabar" onClick={() => void saveExistingConcept()} isLoading={store.saving} isDisabled={store.saving} data-testid="wizard-save-existing-concept">保存并继续</Button>
              </Stack>
            </CardBody>
          </Card>
        )}

        {store.currentProject && Boolean(store.currentProject.description.trim()) && !snapshot.steps.find((step) => step.id === 'relationship')?.completed && (
          <Card data-testid="wizard-character-step">
            <CardHeader><Text fontWeight="bold">2. 主角和核心关系</Text></CardHeader>
            <CardBody>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isRequired><FormLabel>主角</FormLabel><Input value={protagonistName} onChange={(event) => setProtagonistName(event.target.value)} data-testid="wizard-protagonist" /></FormControl>
                <FormControl isRequired><FormLabel>核心角色</FormLabel><Input value={coreCharacterName} onChange={(event) => setCoreCharacterName(event.target.value)} data-testid="wizard-core-character" /></FormControl>
                <FormControl isRequired><FormLabel>关系类型</FormLabel><Input value={relationType} onChange={(event) => setRelationType(event.target.value)} data-testid="wizard-relation-type" /></FormControl>
                <FormControl><FormLabel>关系描述</FormLabel><Input value={relationDescription} onChange={(event) => setRelationDescription(event.target.value)} /></FormControl>
              </SimpleGrid>
              <Button mt={4} colorScheme="cinnabar" onClick={() => void createCharactersAndRelation()} isLoading={store.saving} isDisabled={store.saving} data-testid="wizard-create-characters">创建角色和关系</Button>
            </CardBody>
          </Card>
        )}

        {store.currentProject && snapshot.steps.find((step) => step.id === 'relationship')?.completed && needsInitialDraft && (
          <Card data-testid="wizard-draft-step">
            <CardHeader><Text fontWeight="bold">3. 世界观与初始结构草案</Text></CardHeader>
            <CardBody>
              <Alert status="info"><AlertIcon />此操作创建本地可编辑脚手架，不会调用模型，也不会自动确认大纲。</Alert>
              <Button mt={4} colorScheme="cinnabar" onClick={() => void createInitialDraft()} isLoading={store.saving} isDisabled={store.saving} data-testid="wizard-create-draft">生成初始草案</Button>
            </CardBody>
          </Card>
        )}

        {firstChapterOutline && (
          <Card data-testid="wizard-outline-step">
            <CardHeader><Text fontWeight="bold">4. 审核第一卷与第一章大纲</Text></CardHeader>
            <CardBody>
              <Stack spacing={3}>
                <Text>第一卷：{firstVolumeOutline?.summary || '待补充'}，状态：{firstVolumeOutline?.status ?? '缺少卷纲'}</Text>
                <Text>第一章：{firstChapterOutline.title}，状态：{firstChapterOutline.status}</Text>
                <HStack flexWrap="wrap">
                  <Button variant="outline" onClick={() => navigate('/workbench/outline')} isDisabled={store.saving}>编辑大纲</Button>
                  {firstVolumeOutline?.status === 'draft' && <Button onClick={() => void store.confirmVolumeOutline(firstVolumeOutline.id)} isLoading={store.saving} isDisabled={store.saving} data-testid="wizard-confirm-volume">确认第一卷</Button>}
                  {firstVolumeOutline?.status === 'confirmed' && <Button onClick={() => void store.lockVolumeOutline(firstVolumeOutline.id)} isLoading={store.saving} isDisabled={store.saving}>锁定第一卷</Button>}
                  {firstChapterOutline.status === 'draft' && <Button onClick={() => void store.confirmChapterOutline(firstChapterOutline.id)} isLoading={store.saving} isDisabled={store.saving} data-testid="wizard-confirm-chapter">确认第一章</Button>}
                  {firstChapterOutline.status === 'confirmed' && <Button onClick={() => void store.lockChapterOutline(firstChapterOutline.id)} isLoading={store.saving} isDisabled={store.saving}>锁定第一章</Button>}
                </HStack>
              </Stack>
            </CardBody>
          </Card>
        )}

        <Card data-testid="wizard-preflight-step">
          <CardHeader><Text fontWeight="bold">5. 生成前预检</Text></CardHeader>
          <CardBody>
            <WorkflowCheckList checks={snapshot.checks} />
            <Button
              mt={4}
              colorScheme="cinnabar"
              isDisabled={!snapshot.canGenerate}
              onClick={() => navigate('/workbench/write')}
              data-testid="wizard-go-write"
            >
              前往生成第一章
            </Button>
          </CardBody>
        </Card>
      </Stack>
    </WorkbenchPage>
  )
}

export default FirstChapterWizardPage
