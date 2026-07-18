import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  HStack,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react'
import { FaCheck, FaLightbulb, FaTimes } from 'react-icons/fa'
import type { Foreshadow } from '../../shared/narrativeWorkbench'
import { WorkbenchEmpty, WorkbenchError, WorkbenchPage, formatDate, statusColor } from '../components/WorkbenchPrimitives'
import { useNarrativeStore } from '../stores/narrativeStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

export type NarrativeSection = 'memory' | 'foreshadow' | 'graph' | 'skills' | 'revisions'

const foreshadowStatuses: Foreshadow['status'][] = ['suggested', 'planned', 'planted', 'active', 'revealed', 'paid_off', 'resolved', 'abandoned']

const sectionMeta: Record<NarrativeSection, { eyebrow: string; title: string; description: string }> = {
  memory: { eyebrow: 'NARRATIVE MEMORY', title: '叙事记忆', description: '把章节中可复用的事实、事件、人物状态和主题沉淀为可审核记忆。' },
  foreshadow: { eyebrow: 'FORESHADOWING', title: '伏笔', description: '跟踪伏笔从建议、埋设、激活到回收的状态变化，并保留事件日志。' },
  graph: { eyebrow: 'RELATION GRAPH', title: '关系图谱', description: '查看角色、组织和世界观实体之间的有向关系，帮助检查设定是否互相冲突。' },
  skills: { eyebrow: 'SKILLS', title: '项目技能', description: '按项目启用或关闭叙事技能。开关状态会进入 Agent 的受控上下文。' },
  revisions: { eyebrow: 'REVISIONS', title: '章节修订与 diff', description: '在章节版本之间查看块级变化，应用修订前保留当前版本和操作记录。' },
}

function WorkbenchNarrativePage({ section }: { section: NarrativeSection }) {
  const meta = sectionMeta[section]
  const { currentProject, chapterOutlines, characters, organizations, worldviewEntries, relations } = useWorkbenchStore()
  const narrative = useNarrativeStore()
  const [chapterId, setChapterId] = useState('')
  const [extractionContent, setExtractionContent] = useState('')
  const [selectedForeshadowId, setSelectedForeshadowId] = useState('')
  const [fromRevisionId, setFromRevisionId] = useState('')
  const [toRevisionId, setToRevisionId] = useState('')

  useEffect(() => {
    if (currentProject) void narrative.load(currentProject.id)
  }, [currentProject, narrative.load])

  useEffect(() => {
    if (!chapterId && chapterOutlines[0]) setChapterId(chapterOutlines[0].id)
  }, [chapterId, chapterOutlines])

  useEffect(() => {
    if (section === 'revisions' && currentProject && chapterId) void narrative.loadChapter(currentProject.id, chapterId)
  }, [chapterId, currentProject, narrative.loadChapter, section])

  const selectedForeshadow = narrative.foreshadows.find((item) => item.id === selectedForeshadowId) ?? narrative.foreshadows[0] ?? null
  const entityNames = useMemo(() => {
    const names = new Map<string, string>()
    characters.forEach((item) => names.set(`character:${item.id}`, item.name))
    organizations.forEach((item) => names.set(`organization:${item.id}`, item.name))
    worldviewEntries.forEach((item) => names.set(`worldview:${item.id}`, item.title))
    return names
  }, [characters, organizations, worldviewEntries])

  if (!currentProject) {
    return <WorkbenchPage eyebrow={meta.eyebrow} title={meta.title} description={meta.description}><Alert status="info"><AlertIcon />请先选择一个创作项目。</Alert></WorkbenchPage>
  }

  return <WorkbenchPage eyebrow={meta.eyebrow} title={meta.title} description={meta.description}><WorkbenchError message={narrative.error} />{section === 'memory' && <MemoryPanel chapterId={chapterId} setChapterId={setChapterId} content={extractionContent} setContent={setExtractionContent} chapterOutlines={chapterOutlines} narrative={narrative} />}{section === 'foreshadow' && <ForeshadowPanel chapterId={chapterId} setChapterId={setChapterId} chapterOutlines={chapterOutlines} selected={selectedForeshadow} setSelected={setSelectedForeshadowId} narrative={narrative} />}{section === 'graph' && <GraphPanel relations={relations} entityNames={entityNames} />}{section === 'skills' && <SkillsPanel narrative={narrative} />}{section === 'revisions' && <RevisionPanel chapterId={chapterId} setChapterId={setChapterId} fromRevisionId={fromRevisionId} setFromRevisionId={setFromRevisionId} toRevisionId={toRevisionId} setToRevisionId={setToRevisionId} chapterOutlines={chapterOutlines} narrative={narrative} />}</WorkbenchPage>
}

function MemoryPanel({ chapterId, setChapterId, content, setContent, chapterOutlines, narrative }: { chapterId: string; setChapterId: (value: string) => void; content: string; setContent: (value: string) => void; chapterOutlines: ReturnType<typeof useWorkbenchStore.getState>['chapterOutlines']; narrative: ReturnType<typeof useNarrativeStore.getState> }) {
  return (
    <Stack spacing={5}>
      <Card>
        <CardBody>
          <Stack spacing={4}>
            <Select value={chapterId} onChange={(event) => setChapterId(event.target.value)} placeholder="选择来源章节">
              {chapterOutlines.map((chapter) => <option key={chapter.id} value={chapter.id}>第 {chapter.chapter_number} 章 · {chapter.title}</option>)}
            </Select>
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="可选：粘贴章节内容。留空时使用已有章节内容。" minH="150px" />
            <Button alignSelf="flex-start" colorScheme="cinnabar" isLoading={narrative.saving} isDisabled={!chapterId} onClick={() => void narrative.extractMemories(chapterId, content || undefined)}>提取记忆建议</Button>
          </Stack>
        </CardBody>
      </Card>
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
        <Card>
          <CardHeader><HStack justify="space-between"><Text fontWeight="bold">待审核建议</Text><Badge>{narrative.proposals.length}</Badge></HStack></CardHeader>
          <CardBody>
            {narrative.proposals.length === 0 ? <Text color="ink.500">暂无待审核记忆建议。</Text> : (
              <VStack align="stretch" spacing={3}>
                {narrative.proposals.map((proposal) => (
                  <Card key={proposal.id} variant="outline">
                    <CardBody>
                      <Stack spacing={2}>
                        <HStack><Badge colorScheme="orange">{proposal.memory_type}</Badge><Text fontWeight="bold">{proposal.title}</Text></HStack>
                        <Text fontSize="sm" color="ink.600">{proposal.content}</Text>
                        <Text fontSize="xs" color="ink.500">置信度：{Math.round(proposal.confidence * 100)}%</Text>
                        <HStack justify="flex-end"><Button size="sm" leftIcon={<FaTimes />} variant="outline" onClick={() => void narrative.rejectProposal(proposal.id)}>拒绝</Button><Button size="sm" leftIcon={<FaCheck />} colorScheme="cinnabar" onClick={() => void narrative.approveProposal(proposal.id)}>采纳</Button></HStack>
                      </Stack>
                    </CardBody>
                  </Card>
                ))}
              </VStack>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><HStack justify="space-between"><Text fontWeight="bold">已确认记忆</Text><Badge colorScheme="green">{narrative.memories.length}</Badge></HStack></CardHeader>
          <CardBody>
            {narrative.memories.length === 0 ? <WorkbenchEmpty title="还没有已确认记忆" description="采纳建议后，记忆会成为后续章节的可复用事实。" /> : <VStack align="stretch" spacing={3}>{narrative.memories.map((memory) => <MemoryCard key={memory.id} memory={memory} />)}</VStack>}
          </CardBody>
        </Card>
      </SimpleGrid>
    </Stack>
  )
}

function MemoryCard({ memory }: { memory: ReturnType<typeof useNarrativeStore.getState>['memories'][number] }) {
  return <Card variant="outline"><CardBody><HStack align="flex-start"><Badge colorScheme="green">{memory.memory_type}</Badge><Stack spacing={1}><Text fontWeight="bold">{memory.title}</Text><Text fontSize="sm" color="ink.600">{memory.content}</Text><Text fontSize="xs" color="ink.500">重要度 {memory.importance} · {formatDate(memory.updated_at)}</Text></Stack></HStack></CardBody></Card>
}

function ForeshadowPanel({ chapterId, setChapterId, chapterOutlines, selected, setSelected, narrative }: { chapterId: string; setChapterId: (value: string) => void; chapterOutlines: ReturnType<typeof useWorkbenchStore.getState>['chapterOutlines']; selected: Foreshadow | null; setSelected: (value: string) => void; narrative: ReturnType<typeof useNarrativeStore.getState> }) {
  return <Stack spacing={5}><Card><CardBody><HStack><Select value={chapterId} onChange={(event) => setChapterId(event.target.value)} placeholder="建议来源章节">{chapterOutlines.map((chapter) => <option key={chapter.id} value={chapter.id}>第 {chapter.chapter_number} 章 · {chapter.title}</option>)}</Select><Button leftIcon={<FaLightbulb />} colorScheme="cinnabar" isDisabled={!chapterId} isLoading={narrative.saving} onClick={() => void narrative.suggestForeshadows(chapterId)}>让 Agent 建议伏笔</Button></HStack></CardBody></Card><SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}><Card><CardHeader><HStack justify="space-between"><Text fontWeight="bold">伏笔清单</Text><Badge>{narrative.foreshadows.length}</Badge></HStack></CardHeader><CardBody>{narrative.foreshadows.length === 0 ? <WorkbenchEmpty title="还没有伏笔" description="可以从章节结尾钩子开始，让 Agent 给出建议或手动记录。" /> : <VStack align="stretch" spacing={2}>{narrative.foreshadows.map((item) => <Button key={item.id} variant={selected?.id === item.id ? 'solid' : 'ghost'} colorScheme={selected?.id === item.id ? 'cinnabar' : 'ink'} justifyContent="space-between" onClick={() => { setSelected(item.id); void narrative.loadForeshadowEvents(item.id) }}><Text noOfLines={1}>{item.title}</Text><Badge colorScheme={statusColor(item.status)}>{item.status}</Badge></Button>)}</VStack>}</CardBody></Card><Card><CardHeader><Text fontWeight="bold">伏笔详情</Text></CardHeader><CardBody>{selected ? <Stack spacing={3}><HStack><Badge colorScheme={statusColor(selected.status)}>{selected.status}</Badge><Text fontWeight="bold">{selected.title}</Text></HStack><Text color="ink.600">{selected.description || '暂无描述'}</Text><Select value={selected.status} onChange={(event) => void narrative.transitionForeshadow(selected.id, event.target.value as Foreshadow['status'])}>{foreshadowStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</Select><Text fontSize="sm" fontWeight="bold">事件日志</Text>{narrative.foreshadowEvents.length === 0 ? <Text fontSize="sm" color="ink.500">暂无事件。</Text> : narrative.foreshadowEvents.map((event) => <Text key={event.id} fontSize="sm" color="ink.600">{event.event_type} · {event.note || '无备注'} · {formatDate(event.created_at)}</Text>)}</Stack> : <Text color="ink.500">选择一条伏笔查看详情。</Text>}</CardBody></Card></SimpleGrid></Stack>
}

function GraphPanel({ relations, entityNames }: { relations: ReturnType<typeof useWorkbenchStore.getState>['relations']; entityNames: Map<string, string> }) {
  if (relations.length === 0) return <WorkbenchEmpty title="关系图谱为空" description="在关系页添加角色、组织或世界观实体之间的关系。" />
  return <Card><CardBody><VStack align="stretch" spacing={3}>{relations.map((relation) => <Card key={relation.id} variant="outline"><CardBody><HStack align="flex-start" spacing={4}><Badge colorScheme="cinnabar">{relation.relation_type}</Badge><Stack spacing={1}><Text fontWeight="bold">{entityNames.get(`${relation.source_entity_type}:${relation.source_entity_id}`) ?? relation.source_entity_id} → {entityNames.get(`${relation.target_entity_type}:${relation.target_entity_id}`) ?? relation.target_entity_id}</Text><Text fontSize="sm" color="ink.600">{relation.description || '暂无描述'}</Text><Text fontSize="xs" color="ink.500">强度：{relation.strength ?? '未设置'}</Text></Stack></HStack></CardBody></Card>)}</VStack></CardBody></Card>
}

function SkillsPanel({ narrative }: { narrative: ReturnType<typeof useNarrativeStore.getState> }) {
  return narrative.skills.length === 0 ? <WorkbenchEmpty title="还没有项目技能" description="技能定义由主进程提供，项目加载后会显示可用的受控能力。" /> : <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>{narrative.skills.map((skill) => <Card key={skill.id} variant="outline"><CardBody><HStack justify="space-between" align="flex-start"><Stack><HStack><Text fontWeight="bold">{skill.name}</Text><Badge colorScheme={skill.enabled ? 'green' : 'gray'}>{skill.enabled ? '已启用' : '已关闭'}</Badge></HStack><Text fontSize="sm" color="ink.600">{skill.description}</Text><Text fontSize="xs" color="ink.500">版本 {skill.version}</Text></Stack><Checkbox isChecked={skill.enabled} onChange={(event) => void narrative.toggleSkill(skill.name, event.target.checked)}>启用</Checkbox></HStack></CardBody></Card>)}</SimpleGrid>
}

function RevisionPanel({ chapterId, setChapterId, fromRevisionId, setFromRevisionId, toRevisionId, setToRevisionId, chapterOutlines, narrative }: { chapterId: string; setChapterId: (value: string) => void; fromRevisionId: string; setFromRevisionId: (value: string) => void; toRevisionId: string; setToRevisionId: (value: string) => void; chapterOutlines: ReturnType<typeof useWorkbenchStore.getState>['chapterOutlines']; narrative: ReturnType<typeof useNarrativeStore.getState> }) {
  return <Stack spacing={5}><Card><CardBody><HStack><Select value={chapterId} onChange={(event) => setChapterId(event.target.value)} placeholder="选择章节">{chapterOutlines.map((chapter) => <option key={chapter.id} value={chapter.id}>第 {chapter.chapter_number} 章 · {chapter.title}</option>)}</Select><Badge>{narrative.revisions.length} 个修订</Badge></HStack></CardBody></Card>{narrative.revisions.length === 0 ? <WorkbenchEmpty title="暂无章节修订" description="完成章节生成或修订任务后，块级版本会出现在这里。" /> : <><Card><CardBody><SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}><Select value={fromRevisionId} onChange={(event) => setFromRevisionId(event.target.value)} placeholder="对比起点">{narrative.revisions.map((revision) => <option key={revision.id} value={revision.id}>修订 {revision.revision_number} · {revision.operation}</option>)}</Select><Select value={toRevisionId} onChange={(event) => setToRevisionId(event.target.value)} placeholder="对比终点">{narrative.revisions.map((revision) => <option key={revision.id} value={revision.id}>修订 {revision.revision_number} · {revision.operation}</option>)}</Select></SimpleGrid><HStack mt={4}><Button onClick={() => void narrative.compareRevisions(fromRevisionId, toRevisionId)} isDisabled={!fromRevisionId || !toRevisionId}>查看 diff</Button>{toRevisionId && <Button colorScheme="cinnabar" onClick={() => void narrative.applyRevision(toRevisionId)} isLoading={narrative.saving}>应用终点修订</Button>}</HStack></CardBody></Card><Card><CardHeader><Text fontWeight="bold">修订列表</Text></CardHeader><CardBody><VStack align="stretch" spacing={2}>{narrative.revisions.map((revision) => <HStack key={revision.id} justify="space-between"><Text fontSize="sm">修订 {revision.revision_number} · {revision.summary || '无摘要'}</Text><Badge colorScheme={revision.is_current ? 'green' : 'gray'}>{revision.is_current ? '当前' : formatDate(revision.created_at)}</Badge></HStack>)}</VStack></CardBody></Card>{narrative.diff && <Card><CardHeader><Text fontWeight="bold">块级 diff</Text></CardHeader><CardBody><SimpleGrid columns={4} spacing={3} mb={4}><Badge>未变 {narrative.diff.unchanged_count}</Badge><Badge colorScheme="green">新增 {narrative.diff.added_count}</Badge><Badge colorScheme="red">删除 {narrative.diff.removed_count}</Badge><Badge colorScheme="orange">修改 {narrative.diff.modified_count}</Badge></SimpleGrid><VStack align="stretch" spacing={2}>{narrative.diff.changes.map((change) => <Text key={`${change.block_id}-${change.kind}`} fontSize="sm" whiteSpace="pre-wrap" color={change.kind === 'removed' ? 'red.600' : change.kind === 'added' ? 'green.600' : 'ink.700'}>[{change.kind}] {change.after?.text ?? change.before?.text ?? ''}</Text>)}</VStack></CardBody></Card>}</>}</Stack>
}

export default WorkbenchNarrativePage
