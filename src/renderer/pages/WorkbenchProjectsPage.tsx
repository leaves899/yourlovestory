import { useEffect, useRef, useState } from 'react'
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
  SimpleGrid,
  Divider,
  Stack,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react'
import { FaCheck, FaDownload, FaFileImport, FaTrash } from 'react-icons/fa'
import { WorkbenchEmpty, WorkbenchError, WorkbenchPage, formatDate } from '../components/WorkbenchPrimitives'
import { useWorkbenchStore } from '../stores/workbenchStore'
import type {
  ProjectImportPreview,
  ProjectImportResult,
} from '../../shared/projectPortability'

function WorkbenchProjectsPage() {
  const {
    projects,
    currentProject,
    error,
    saving,
    createProject,
    selectProject,
    deleteProject,
    updateProject,
    initialize,
  } = useWorkbenchStore()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [portabilityMessage, setPortabilityMessage] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ProjectImportPreview | null>(null)
  const [importResult, setImportResult] = useState<ProjectImportResult | null>(null)
  const [portabilityBusy, setPortabilityBusy] = useState(false)
  const importTokenRef = useRef<string | null>(null)

  useEffect(() => () => {
    const token = importTokenRef.current
    if (token) void window.electronAPI.cancelProjectImport(token)
  }, [])

  const responseError = (value: { error?: { message: string } }, fallback: string): string =>
    value.error?.message ?? fallback

  const exportProject = async (projectId: string): Promise<void> => {
    setPortabilityBusy(true)
    setFormError(null)
    setPortabilityMessage('正在导出项目…')
    try {
      const response = await window.electronAPI.exportProject(projectId)
      if (!response.success || !response.data) {
        throw new Error(responseError(response, '项目导出失败。'))
      }
      if (response.data.canceled) {
        setPortabilityMessage('已取消导出。')
        return
      }
      const total = Object.values(response.data.recordCounts ?? {}).reduce(
        (sum, count) => sum + count,
        0,
      )
      setPortabilityMessage(
        `导出成功：${response.data.fileName ?? '项目文件'}，${response.data.size ?? 0} 字节，${total} 条内容。凭据和运行历史未导出。`,
      )
    } catch (exportError) {
      setPortabilityMessage(null)
      setFormError(exportError instanceof Error ? exportError.message : '项目导出失败。')
    } finally {
      setPortabilityBusy(false)
    }
  }

  const inspectImport = async (): Promise<void> => {
    if (importTokenRef.current) {
      await window.electronAPI.cancelProjectImport(importTokenRef.current)
      importTokenRef.current = null
    }
    setPortabilityBusy(true)
    setFormError(null)
    setPortabilityMessage(null)
    setImportResult(null)
    try {
      const response = await window.electronAPI.inspectProjectImport()
      if (!response.success || !response.data) {
        throw new Error(responseError(response, '项目文件检查失败。'))
      }
      if (response.data.canceled) {
        setPortabilityMessage('已取消选择项目文件。')
        return
      }
      importTokenRef.current = response.data.preview.importToken
      setImportPreview(response.data.preview)
    } catch (inspectError) {
      setFormError(inspectError instanceof Error ? inspectError.message : '项目文件检查失败。')
    } finally {
      setPortabilityBusy(false)
    }
  }

  const cancelImport = async (): Promise<void> => {
    const token = importTokenRef.current
    importTokenRef.current = null
    setImportPreview(null)
    if (token) await window.electronAPI.cancelProjectImport(token)
    setPortabilityMessage('已取消导入并清理暂存文件。')
  }

  const commitImport = async (): Promise<void> => {
    const token = importTokenRef.current
    if (!token) return
    importTokenRef.current = null
    setPortabilityBusy(true)
    setFormError(null)
    try {
      const response = await window.electronAPI.commitProjectImport(token, true)
      if (!response.success || !response.data) {
        throw new Error(responseError(response, '项目导入失败。'))
      }
      setImportResult(response.data)
      setImportPreview(null)
      useWorkbenchStore.setState({ initialized: false })
      await initialize()
      setPortabilityMessage(`已导入项目「${response.data.projectName}」。模型配置已导入，但凭据未导入，需要重新绑定。`)
    } catch (commitError) {
      setImportPreview(null)
      setFormError(commitError instanceof Error ? commitError.message : '项目导入失败。')
    } finally {
      setPortabilityBusy(false)
    }
  }

  const submit = async (): Promise<void> => {
    if (!name.trim() || !slug.trim()) {
      setFormError('项目名称和 slug 都不能为空。')
      return
    }
    setFormError(null)
    try {
      await createProject({ name: name.trim(), slug: slug.trim(), description: description.trim() })
      setName('')
      setSlug('')
      setDescription('')
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : String(submitError))
    }
  }

  const remove = async (projectId: string): Promise<void> => {
    const project = projects.find((item) => item.id === projectId)
    if (!project || projectId === currentProject?.id) return
    const confirmed = window.confirm(`确认删除项目「${project.name}」？该项目的设定、素材和大纲都会被删除。`)
    if (!confirmed) return
    await deleteProject(projectId)
  }

  const rename = async (): Promise<void> => {
    if (!currentProject) return
    const nextName = window.prompt('项目名称', currentProject.name)
    if (!nextName?.trim() || nextName.trim() === currentProject.name) return
    await updateProject({ name: nextName.trim() })
  }

  const restore = async (projectId: string): Promise<void> => {
    setFormError(null)
    try {
      const selected = await selectProject(projectId)
      if (!selected) return
      await useWorkbenchStore.getState().updateProject({ status: 'active' })
    } catch (restoreError) {
      setFormError(restoreError instanceof Error ? restoreError.message : String(restoreError))
    }
  }

  return (
    <WorkbenchPage eyebrow="PROJECTS" title="项目与配置" description="项目是选择、任务、上下文和删除保护的边界。每个项目独立维护自己的设定与故事素材。">
      <WorkbenchError message={error ?? formError} />
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
        <Card>
          <CardHeader><Text fontWeight="bold">创建项目</Text></CardHeader>
          <CardBody>
            <Stack spacing={4}>
              <FormControl><FormLabel>项目名称</FormLabel><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：雾中来信" data-testid="project-name-input" /></FormControl>
              <FormControl><FormLabel>slug</FormLabel><Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="例如：letters-in-fog" data-testid="project-slug-input" /></FormControl>
              <FormControl><FormLabel>简介</FormLabel><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="写作边界和一句话梗概" /></FormControl>
              <Button colorScheme="cinnabar" isLoading={saving} onClick={() => void submit()} data-testid="create-project-button">创建并进入</Button>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><HStack justify="space-between"><Text fontWeight="bold">已有项目</Text><HStack><Badge colorScheme="bamboo">{projects.length}</Badge><Button size="sm" leftIcon={<FaFileImport />} isLoading={portabilityBusy} onClick={() => void inspectImport()} data-testid="import-project-button">导入项目</Button></HStack></HStack></CardHeader>
          <CardBody>
            {projects.length === 0 ? (
              <WorkbenchEmpty
                title="还没有项目"
                description="创建第一个项目后，卷章大纲和写作任务才会有明确的上下文。"
                actionLabel="使用左侧表单创建"
                onAction={() => document.querySelector<HTMLInputElement>('[data-testid="project-name-input"]')?.focus()}
                secondaryActionLabel="返回黄金路径"
                onSecondaryAction={() => { window.location.hash = '#/workbench/first-chapter' }}
              />
            ) : (
              <VStack align="stretch" spacing={3} data-testid="project-list">
                {projects.map((project) => (
                  <Card key={project.id} variant="outline" data-testid={`project-card-${project.id}`}>
                    <CardBody>
                      <Stack spacing={3}>
                        <Stack spacing={1} minW={0}>
                          <HStack><Text fontWeight="bold" noOfLines={1}>{project.name}</Text>{project.id === currentProject?.id && <Badge colorScheme="cinnabar">当前</Badge>}<Badge colorScheme={project.status === 'active' ? 'green' : 'gray'}>{project.status === 'active' ? '进行中' : '已归档'}</Badge></HStack>
                          <Text fontSize="sm" color="ink.600">{project.slug}</Text>
                          <Text fontSize="sm" color="ink.600" noOfLines={2}>{project.description || '暂无简介'}</Text>
                          <Text fontSize="xs" color="ink.500">更新时间：{formatDate(project.updated_at)}</Text>
                        </Stack>
                        <HStack flexWrap="wrap">
                          <Button size="sm" variant="outline" leftIcon={<FaDownload />} isLoading={portabilityBusy} isDisabled={portabilityBusy} onClick={() => void exportProject(project.id)} data-testid={`export-project-${project.id}`}>导出项目</Button>
                          {project.status !== 'active' && (
                            <Button size="sm" colorScheme="cinnabar" isLoading={saving} isDisabled={saving} onClick={() => void restore(project.id)}>
                              恢复为进行中
                            </Button>
                          )}
                          <Button size="sm" variant={project.id === currentProject?.id ? 'solid' : 'outline'} colorScheme={project.id === currentProject?.id ? 'cinnabar' : 'ink'} leftIcon={project.id === currentProject?.id ? <FaCheck /> : undefined} onClick={() => void selectProject(project.id)}>{project.id === currentProject?.id ? '当前项目' : '切换'}</Button>
                          <Button size="sm" variant="ghost" colorScheme="red" leftIcon={<FaTrash />} isDisabled={project.id === currentProject?.id} onClick={() => void remove(project.id)} aria-label={`删除${project.name}`}>删除</Button>
                        </HStack>
                      </Stack>
                    </CardBody>
                  </Card>
                ))}
              </VStack>
            )}
          </CardBody>
        </Card>
      </SimpleGrid>
      {(portabilityMessage || importPreview || importResult) && (
        <Card mt={5} data-testid="project-portability-panel">
          <CardHeader><Text fontWeight="bold">项目可移植性</Text></CardHeader>
          <CardBody>
            <Stack spacing={3}>
              {portabilityMessage && <Alert status="success"><AlertIcon /><Text>{portabilityMessage}</Text></Alert>}
              {importPreview && (
                <>
                  <Text fontWeight="bold">导入预览：{importPreview.projectName}</Text>
                  <Text fontSize="sm">格式版本：{importPreview.formatVersion} · 导出时间：{formatDate(importPreview.exportedAt)} · 内容总数：{Object.values(importPreview.recordCounts).reduce((sum, count) => sum + count, 0)}</Text>
                  <Alert status="warning"><AlertIcon /><Text>API Key、模型凭据和运行历史不会导入。模型配置导入后需要重新绑定凭据。</Text></Alert>
                  {importPreview.warnings.map((warning) => (
                    <Text key={warning.code} fontSize="sm">• {warning.message}</Text>
                  ))}
                  <Divider />
                  <HStack>
                    <Button colorScheme="cinnabar" isLoading={portabilityBusy} onClick={() => void commitImport()} data-testid="confirm-project-import">确认作为新项目导入</Button>
                    <Button variant="outline" onClick={() => void cancelImport()} data-testid="cancel-project-import">取消</Button>
                  </HStack>
                </>
              )}
              {importResult && (
                <HStack justify="space-between">
                  <Text fontSize="sm">新项目 ID：{importResult.projectId}</Text>
                  <Button size="sm" colorScheme="cinnabar" onClick={() => void selectProject(importResult.projectId)} data-testid="open-imported-project">打开导入项目</Button>
                </HStack>
              )}
            </Stack>
          </CardBody>
        </Card>
      )}
      {currentProject && <Alert status="info" mt={5}><AlertIcon /><Text flex={1}>当前项目「{currentProject.name}」受删除保护，必须先切换到其他项目才能删除。</Text><Button size="sm" variant="outline" onClick={() => void rename()}>重命名</Button></Alert>}
    </WorkbenchPage>
  )
}

export default WorkbenchProjectsPage
