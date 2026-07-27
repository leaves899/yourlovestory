import {
  Alert,
  AlertIcon,
  Badge,
  Button,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import type { WorkflowCheck } from '../../shared/firstChapterWorkflow'

function alertStatus(check: WorkflowCheck): 'error' | 'warning' | 'info' {
  if (check.severity === 'error') return 'error'
  if (check.severity === 'warning') return 'warning'
  return 'info'
}

export function WorkflowCheckList({ checks }: { checks: WorkflowCheck[] }) {
  const navigate = useNavigate()

  if (checks.length === 0) {
    return (
      <Alert status="success" data-testid="workflow-checks-passed">
        <AlertIcon />
        所有生成前条件均已满足。
      </Alert>
    )
  }

  return (
    <Stack spacing={2} data-testid="workflow-check-list">
      {checks.map((check) => (
        <Alert key={check.id} status={alertStatus(check)} alignItems="flex-start" data-testid={`workflow-check-${check.id}`}>
          <AlertIcon mt={1} />
          <Stack flex={1} spacing={1}>
            <HStack>
              <Text fontWeight="bold">{check.title}</Text>
              <Badge>{check.severity === 'error' ? '错误' : check.severity === 'warning' ? '警告' : '建议'}</Badge>
            </HStack>
            <Text fontSize="sm">{check.message}</Text>
          </Stack>
          {check.actionRoute && check.actionLabel && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(check.actionRoute!)}
              data-testid={`workflow-action-${check.id}`}
            >
              {check.actionLabel}
            </Button>
          )}
        </Alert>
      ))}
    </Stack>
  )
}
