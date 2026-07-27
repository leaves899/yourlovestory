import { useEffect, useMemo, useState } from 'react'
import {
  evaluateFirstChapterWorkflow,
  type FirstChapterWorkflowSnapshot,
} from '../../shared/firstChapterWorkflow'
import { useNarrativeStore } from '../stores/narrativeStore'
import { useTaskStore } from '../stores/taskStore'
import { useWorkbenchStore } from '../stores/workbenchStore'

interface WorkflowOptions {
  endpointValid?: boolean
}

export function useFirstChapterWorkflow(
  options: WorkflowOptions = {},
): FirstChapterWorkflowSnapshot {
  const workbench = useWorkbenchStore()
  const taskState = useTaskStore()
  const narrative = useNarrativeStore()
  const [credentialConfigured, setCredentialConfigured] = useState(false)

  useEffect(() => {
    const projectId = workbench.currentProject?.id
    if (!projectId) {
      setCredentialConfigured(false)
      return
    }
    void Promise.all([
      window.electronAPI.getLlmCredentialStatus({ scope: 'project', projectId }),
      window.electronAPI.getLlmCredentialStatus({ scope: 'app' }),
    ])
      .then((responses) => setCredentialConfigured(
        responses.some((response) => response.success && response.data?.configured === true),
      ))
      .catch(() => setCredentialConfigured(false))
    if (taskState.projectId !== projectId) void taskState.load(projectId)
    if (narrative.projectId !== projectId) void narrative.load(projectId)
  }, [
    narrative,
    taskState,
    workbench.currentProject?.id,
  ])

  return useMemo(() => evaluateFirstChapterWorkflow({
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
    chapterVersions: taskState.versions,
    modelCredentialConfigured: credentialConfigured,
    modelEndpointValid: options.endpointValid ?? true,
    generationTaskRunning: taskState.tasks.some((task) =>
      task.task_type === 'chapter-generation' &&
      (task.status === 'pending' || task.status === 'running'),
    ),
    factCheckFindings: taskState.versions.flatMap((version) => version.fact_check.findings),
    memoryProposalCount: narrative.proposals.length,
    foreshadowProposalCount: narrative.foreshadows.filter((item) => item.status === 'suggested').length,
  }), [
    credentialConfigured,
    narrative.foreshadows,
    narrative.proposals,
    options.endpointValid,
    taskState.tasks,
    taskState.versions,
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
