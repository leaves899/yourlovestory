import { useEffect, useMemo, useState } from 'react'
import {
  evaluateFirstChapterWorkflow,
  selectFirstChapterOutline,
  selectFirstChapterVolume,
  type FirstChapterWorkflowSnapshot,
} from '../../shared/firstChapterWorkflow'
import { useNarrativeStore } from '../stores/narrativeStore'
import { useTaskStore, versionsForChapterOutline } from '../stores/taskStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

interface WorkflowOptions {
  endpointValid?: boolean
  targetChapterOutlineId?: string
}

export function useFirstChapterWorkflow(
  options: WorkflowOptions = {},
): FirstChapterWorkflowSnapshot {
  const workbench = useWorkbenchStore()
  const taskState = useTaskStore()
  const narrative = useNarrativeStore()
  const [credentialConfigured, setCredentialConfigured] = useState(false)
  const workflowVolume = useMemo(() => selectFirstChapterVolume(
    workbench.volumes,
    workbench.chapterOutlines,
    options.targetChapterOutlineId,
  ), [options.targetChapterOutlineId, workbench.chapterOutlines, workbench.volumes])
  const workflowChapterOutline = useMemo(() => selectFirstChapterOutline(
    workbench.chapterOutlines,
    workflowVolume,
    options.targetChapterOutlineId,
  ), [options.targetChapterOutlineId, workbench.chapterOutlines, workflowVolume])
  const workflowVersions = useMemo(() => versionsForChapterOutline(
    taskState.tasks,
    taskState.versions,
    workflowChapterOutline?.id,
  ), [taskState.tasks, taskState.versions, workflowChapterOutline?.id])

  useEffect(() => {
    const projectId = workbench.currentProject?.id
    let cancelled = false
    if (!projectId) {
      setCredentialConfigured(false)
      return
    }
    setCredentialConfigured(false)
    void Promise.all([
      window.electronAPI.getLlmCredentialStatus({ scope: 'project', projectId }),
      window.electronAPI.getLlmCredentialStatus({ scope: 'app' }),
    ])
      .then((responses) => {
        if (cancelled) return
        setCredentialConfigured(
          responses.some((response) => response.success && response.data?.configured === true),
        )
      })
      .catch(() => {
        if (!cancelled) setCredentialConfigured(false)
      })
    if (taskState.projectId !== projectId) void taskState.load(projectId)
    if (narrative.projectId !== projectId) void narrative.load(projectId)
    return () => {
      cancelled = true
    }
  }, [
    narrative,
    taskState,
    workbench.currentProject?.id,
  ])

  return useMemo(() => evaluateFirstChapterWorkflow({
    targetChapterOutlineId: options.targetChapterOutlineId,
    project: workbench.currentProject,
    config: workbench.config,
    characters: workbench.characters,
    relations: workbench.relations,
    worldviewEntries: workbench.worldviewEntries,
    organizations: workbench.organizations,
    sourceMaterials: workbench.sourceMaterials,
    volumes: workbench.volumes,
    volumeOutlines: workbench.volumeOutlines,
    chapterOutlines: workbench.chapterOutlines,
    chapterVersions: workflowVersions,
    modelCredentialConfigured: credentialConfigured,
    modelEndpointValid: options.endpointValid ?? true,
    generationTaskRunning: taskState.tasks.some((task) =>
      task.task_type === 'chapter-generation' &&
      (task.status === 'pending' || task.status === 'running'),
    ),
    factCheckFindings: workflowVersions.flatMap((version) => version.fact_check.findings),
    memoryProposalCount: narrative.proposals.length,
    foreshadowProposalCount: narrative.foreshadows.filter((item) => item.status === 'suggested').length,
    narrativeProposalFailures: narrative.proposalFailures,
  }), [
    credentialConfigured,
    narrative.foreshadows,
    narrative.proposals,
    narrative.proposalFailures,
    options.endpointValid,
    options.targetChapterOutlineId,
    taskState.tasks,
    workflowVersions,
    workbench.chapterOutlines,
    workbench.characters,
    workbench.config,
    workbench.currentProject,
    workbench.organizations,
    workbench.relations,
    workbench.sourceMaterials,
    workbench.volumeOutlines,
    workbench.volumes,
    workbench.worldviewEntries,
  ])
}
