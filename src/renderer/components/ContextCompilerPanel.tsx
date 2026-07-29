import { useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Card,
  CardBody,
  CardHeader,
  FormControl,
  FormLabel,
  HStack,
  Select,
  Stack,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react'
import type { TaskView } from '../stores/taskStore'
import {
  buildStageCompileViews,
  selectContextCompilerTask,
  type ContextStageCompileView,
  type ContextTextStage,
  type ContextTraceRow,
} from './contextCompilerTrace'

export type {
  ContextBudgetView,
  ContextStageCompileView,
  ContextTextStage,
  ContextTraceRow,
} from './contextCompilerTrace'
export {
  buildStageCompileViews,
  extractStageCompilesSource,
  parseStageCompileView,
  selectContextCompilerTask,
  taskChapterOutlineIdFromInput,
} from './contextCompilerTrace'

const stageLabel: Record<ContextTextStage, string> = {
  body: '正文',
  summary: '摘要',
  fact_check: '事实核查',
}

function TraceTable({
  rows,
  emptyLabel,
  testId,
}: {
  rows: ContextTraceRow[]
  emptyLabel: string
  testId: string
}) {
  if (rows.length === 0) {
    return (
      <Text fontSize="sm" color="ink.500" data-testid={testId}>
        {emptyLabel}
      </Text>
    )
  }
  return (
    <Box overflowX="auto" data-testid={testId}>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>source_kind</Th>
            <Th>source_id</Th>
            <Th>title</Th>
            <Th>reason</Th>
            <Th isNumeric>tokens</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row) => (
            <Tr key={`${testId}-${row.id}`}>
              <Td>
                <Badge variant="outline">{row.source_kind}</Badge>
              </Td>
              <Td fontFamily="mono" fontSize="xs">
                {row.source_id}
              </Td>
              <Td>{row.title}</Td>
              <Td>
                <Text fontSize="xs" fontWeight="semibold">
                  {row.reason_code}
                </Text>
                <Text fontSize="xs" color="ink.600" noOfLines={2}>
                  {row.reason_message}
                </Text>
              </Td>
              <Td isNumeric>{row.tokens}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  )
}

export interface ContextCompilerPanelProps {
  tasks: readonly TaskView[]
  activeTaskId: string | null
  chapterOutlineId?: string
  /** Controlled debug switch (also used when starting generation). Default false. */
  debug: boolean
  onDebugChange: (debug: boolean) => void
}

export function ContextCompilerPanel({
  tasks,
  activeTaskId,
  chapterOutlineId,
  debug,
  onDebugChange,
}: ContextCompilerPanelProps) {
  const task = useMemo(
    () => selectContextCompilerTask(tasks, activeTaskId, chapterOutlineId),
    [tasks, activeTaskId, chapterOutlineId],
  )
  const stages = useMemo(() => buildStageCompileViews(task, debug === true), [task, debug])
  const [stage, setStage] = useState<ContextTextStage>('body')
  const activeStage = stages.find((item) => item.stage === stage) ?? stages[0] ?? null

  return (
    <Card data-testid="context-compiler-panel">
      <CardHeader>
        <HStack justify="space-between" align="flex-start" flexWrap="wrap" gap={3}>
          <Stack spacing={1}>
            <Text fontWeight="bold">上下文来源</Text>
            <Text fontSize="sm" color="ink.600">
              展示当前或最近一次章节生成任务写入的 Context Compiler trace（来自任务 checkpoint / result）。
            </Text>
          </Stack>
          <FormControl display="flex" alignItems="center" width="auto" data-testid="context-debug-switch">
            <FormLabel htmlFor="context-compiler-debug" mb="0" fontSize="sm" mr={2}>
              Debug
            </FormLabel>
            <Switch
              id="context-compiler-debug"
              isChecked={debug === true}
              onChange={(event) => onDebugChange(event.target.checked === true)}
              colorScheme="orange"
            />
          </FormControl>
        </HStack>
        <Text mt={2} fontSize="sm" color="ink.500">
          Debug 默认关闭。仅当 Debug 打开且任务以 debug 模式生成时，才会显示 final_prompt；关闭时绝不展示完整提示词。
        </Text>
      </CardHeader>
      <CardBody>
        {!task ? (
          <Text color="ink.500" data-testid="context-compiler-empty">
            尚无章节生成任务的上下文 trace。完成一次生成后会出现在这里。
          </Text>
        ) : stages.length === 0 ? (
          <Text color="ink.500" data-testid="context-compiler-empty">
            任务 {task.id.slice(0, 8)}… 尚未写入 stage_compiles（可能仍在排队或为旧任务）。
          </Text>
        ) : (
          <VStack align="stretch" spacing={4}>
            <HStack justify="space-between" flexWrap="wrap" gap={2}>
              <HStack>
                <Badge colorScheme="orange">任务 {task.id.slice(0, 8)}</Badge>
                <Badge>{task.status}</Badge>
                <Badge variant="outline">{task.stage}</Badge>
              </HStack>
              <FormControl maxW="220px">
                <FormLabel fontSize="xs" mb={1}>
                  阶段
                </FormLabel>
                <Select
                  size="sm"
                  value={activeStage?.stage ?? 'body'}
                  onChange={(event) => setStage(event.target.value as ContextTextStage)}
                  data-testid="context-stage-select"
                >
                  {stages.map((item) => (
                    <option key={item.stage} value={item.stage}>
                      {stageLabel[item.stage]}
                    </option>
                  ))}
                </Select>
              </FormControl>
            </HStack>

            {activeStage && (
              <Stack spacing={4} data-testid={`context-stage-${activeStage.stage}`}>
                <SimpleMeta stage={activeStage} />
                <Box>
                  <Text fontWeight="semibold" mb={2}>
                    Selected（{activeStage.selected.length}）
                  </Text>
                  <TraceTable
                    rows={activeStage.selected}
                    emptyLabel="无入选条目"
                    testId="context-selected-table"
                  />
                </Box>
                <Box>
                  <Text fontWeight="semibold" mb={2}>
                    Discarded（{activeStage.discarded.length}）
                  </Text>
                  <TraceTable
                    rows={activeStage.discarded}
                    emptyLabel="无丢弃条目"
                    testId="context-discarded-table"
                  />
                </Box>
                {debug === true && activeStage.final_prompt != null ? (
                  <Box data-testid="context-final-prompt">
                    <Text fontWeight="semibold" mb={2}>
                      final_prompt（仅 debug）
                    </Text>
                    <Box
                      as="pre"
                      p={3}
                      bg="blackAlpha.50"
                      borderRadius="md"
                      fontSize="xs"
                      whiteSpace="pre-wrap"
                      maxH="240px"
                      overflowY="auto"
                    >
                      {activeStage.final_prompt}
                    </Box>
                  </Box>
                ) : (
                  <Box data-testid="context-final-prompt-hidden" display="none" aria-hidden />
                )}
              </Stack>
            )}
          </VStack>
        )}
      </CardBody>
    </Card>
  )
}

function SimpleMeta({ stage }: { stage: ContextStageCompileView }) {
  const budget = stage.budget
  return (
    <Stack spacing={2} data-testid="context-compile-meta">
      <HStack flexWrap="wrap" gap={2}>
        <Badge colorScheme="purple">prompt {stage.prompt_version}</Badge>
        {stage.model && <Badge variant="outline">model {stage.model}</Badge>}
        {stage.temperature != null && (
          <Badge variant="outline">temp {stage.temperature}</Badge>
        )}
        {stage.max_output_tokens != null && (
          <Badge variant="outline">max_out {stage.max_output_tokens}</Badge>
        )}
        {stage.context_budget != null && (
          <Badge variant="outline">context {stage.context_budget}</Badge>
        )}
      </HStack>
      {budget && (
        <HStack flexWrap="wrap" gap={3} fontSize="sm" data-testid="context-budget-summary">
          <Text>总预算 {budget.total_budget}</Text>
          <Text>已用 {budget.selected_tokens}</Text>
          <Text>输出保留 {budget.max_output_reserved}</Text>
          <Text color="ink.600">系统保留 {budget.system_reserved}</Text>
          <Text color="ink.600">可用 {budget.available_for_prompt}</Text>
          <Text color="ink.600">剩余 {budget.remaining_tokens}</Text>
        </HStack>
      )}
    </Stack>
  )
}

export default ContextCompilerPanel
