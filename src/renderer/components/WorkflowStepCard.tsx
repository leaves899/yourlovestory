import { Badge, Button, Card, CardBody, HStack, Stack, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import type { FirstChapterWorkflowStep } from '../../shared/firstChapterWorkflow'

export function WorkflowStepCard({
  step,
  index,
}: {
  step: FirstChapterWorkflowStep
  index: number
}) {
  const navigate = useNavigate()
  return (
    <Card variant="outline" borderColor={step.current ? 'cinnabar.400' : undefined}>
      <CardBody>
        <HStack justify="space-between">
          <Stack spacing={1}>
            <HStack>
              <Badge colorScheme={step.completed ? 'green' : step.current ? 'orange' : 'gray'}>
                {step.completed ? '已完成' : `第 ${index + 1} 步`}
              </Badge>
              <Text fontWeight="bold">{step.title}</Text>
            </HStack>
          </Stack>
          {!step.completed && (
            <Button size="sm" colorScheme={step.current ? 'cinnabar' : 'gray'} onClick={() => navigate(step.actionRoute)}>
              {step.actionLabel}
            </Button>
          )}
        </HStack>
      </CardBody>
    </Card>
  )
}
