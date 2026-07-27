import { useMemo, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react'
import { FaTrash } from 'react-icons/fa'
import type { RelationEntityType } from '../../shared/novelProject'
import { WorkbenchEmpty, WorkbenchError, WorkbenchPage } from '../components/WorkbenchPrimitives'
import { useWorkbenchStore } from '../stores/workbenchStore'

function WorkbenchRelationsPage() {
  const store = useWorkbenchStore()
  const [sourceType, setSourceType] = useState<RelationEntityType>('character')
  const [sourceId, setSourceId] = useState('')
  const [targetType, setTargetType] = useState<RelationEntityType>('character')
  const [targetId, setTargetId] = useState('')
  const [relationType, setRelationType] = useState('关联')
  const [description, setDescription] = useState('')

  const entities = useMemo(() => ({
    character: store.characters.map((item) => ({ id: item.id, label: item.name })),
    organization: store.organizations.map((item) => ({ id: item.id, label: item.name })),
    worldview: store.worldviewEntries.map((item) => ({ id: item.id, label: item.title })),
  }), [store.characters, store.organizations, store.worldviewEntries])

  const submit = async (): Promise<void> => {
    if (!sourceId || !targetId || sourceId === targetId) return
    await store.createRelation({
      source: { type: sourceType, id: sourceId },
      target: { type: targetType, id: targetId },
      relation_type: relationType.trim() || '关联',
      description: description.trim(),
    })
    setDescription('')
  }

  if (!store.currentProject) {
    return <WorkbenchPage eyebrow="RELATIONS" title="关系" description="建立实体之间的关系，并在关系图谱中检查结构。"><Alert status="info"><AlertIcon />请先选择一个创作项目。</Alert></WorkbenchPage>
  }

  return <WorkbenchPage eyebrow="RELATIONS" title="关系" description="关系的两端可以是角色、组织或世界观条目。保存时会检查端点和版本，删除实体时关联关系会被一并清理。"><WorkbenchError message={store.error} /><SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}><Card><CardHeader><Text fontWeight="bold">新增关系</Text></CardHeader><CardBody><Stack spacing={4}><SimpleGrid columns={2} spacing={3}><FormControl><FormLabel fontSize="sm">起点类型</FormLabel><Select value={sourceType} onChange={(event) => { setSourceType(event.target.value as RelationEntityType); setSourceId('') }}>{entityTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</Select></FormControl><FormControl><FormLabel fontSize="sm">起点</FormLabel><Select value={sourceId} onChange={(event) => setSourceId(event.target.value)} placeholder="选择实体">{entities[sourceType].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></FormControl><FormControl><FormLabel fontSize="sm">终点类型</FormLabel><Select value={targetType} onChange={(event) => { setTargetType(event.target.value as RelationEntityType); setTargetId('') }}>{entityTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</Select></FormControl><FormControl><FormLabel fontSize="sm">终点</FormLabel><Select value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="选择实体">{entities[targetType].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></FormControl></SimpleGrid><FormControl><FormLabel>关系类型</FormLabel><Input value={relationType} onChange={(event) => setRelationType(event.target.value)} /></FormControl><FormControl><FormLabel>说明</FormLabel><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></FormControl><Button colorScheme="cinnabar" isLoading={store.saving} isDisabled={store.saving} onClick={() => void submit()}>保存关系</Button></Stack></CardBody></Card><Card><CardHeader><HStack justify="space-between"><Text fontWeight="bold">关系清单</Text><Badge>{store.relations.length}</Badge></HStack></CardHeader><CardBody>{store.relations.length === 0 ? <WorkbenchEmpty title="还没有关系" description="先补充角色、组织或世界观实体，再连接它们。" actionLabel="前往角色页" onAction={() => { window.location.hash = '#/workbench/characters' }} secondaryActionLabel="返回黄金路径" onSecondaryAction={() => { window.location.hash = '#/workbench/first-chapter' }} /> : <VStack align="stretch" spacing={3}>{store.relations.map((relation) => <Card key={relation.id} variant="outline"><CardBody><HStack justify="space-between" align="flex-start"><Stack><HStack><Badge colorScheme="cinnabar">{relation.relation_type}</Badge><Text fontWeight="bold">{labelFor(relation.source_entity_type, relation.source_entity_id, entities)} → {labelFor(relation.target_entity_type, relation.target_entity_id, entities)}</Text></HStack><Text fontSize="sm" color="ink.600">{relation.description || '暂无说明'}</Text></Stack><Button size="sm" variant="ghost" colorScheme="red" leftIcon={<FaTrash />} onClick={() => { if (window.confirm('确认删除这条关系？')) void store.deleteRelation(relation.id) }}>删除</Button></HStack></CardBody></Card>)}</VStack>}</CardBody></Card></SimpleGrid></WorkbenchPage>
}

const entityTypes: Array<{ value: RelationEntityType; label: string }> = [
  { value: 'character', label: '角色' },
  { value: 'organization', label: '组织' },
  { value: 'worldview', label: '世界观' },
]

function labelFor(type: RelationEntityType, id: string, entities: Record<RelationEntityType, Array<{ id: string; label: string }>>): string {
  return entities[type].find((item) => item.id === id)?.label ?? id
}

export default WorkbenchRelationsPage
