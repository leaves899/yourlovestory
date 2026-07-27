import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  HStack,
  Progress,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFirstChapterWorkflow } from '../hooks/useFirstChapterWorkflow'

export function FirstChapterProgress() {
  const location = useLocation()
  const navigate = useNavigate()
  const snapshot = useFirstChapterWorkflow()
  const currentIndex = snapshot.steps.findIndex((step) => step.current)
  const current = snapshot.steps[currentIndex] ?? snapshot.steps[0]
  const firstMissing = snapshot.checks.find((check) => check.blocking) ?? snapshot.checks[0]

  if (location.pathname === '/workbench/first-chapter') return null

  return (
    <Box px={{ base: 4, md: 8 }} pt={4}>
      <Card variant="outline" data-testid="first-chapter-progress">
        <CardBody>
          <HStack justify="space-between" align="flex-start" gap={4} flexWrap="wrap">
            <Stack spacing={2} flex={1} minW="240px">
              <HStack>
                <Badge colorScheme="cinnabar">首章黄金路径</Badge>
                <Text fontWeight="bold">第 {currentIndex + 1} 步：{current.title}</Text>
                <Text fontSize="sm" color="ink.600">{snapshot.completedStepCount}/{snapshot.totalStepCount}</Text>
              </HStack>
              <Progress value={(snapshot.completedStepCount / snapshot.totalStepCount) * 100} size="sm" colorScheme="cinnabar" />
              <Text fontSize="sm" color="ink.600">
                {firstMissing ? `当前需要：${firstMissing.title}` : '首章流程已完成，可以继续创作。'}
              </Text>
            </Stack>
            <HStack>
              {current && (
                <Button
                  size="sm"
                  colorScheme="cinnabar"
                  onClick={() => navigate(current.actionRoute)}
                  data-testid="first-chapter-next-action"
                >
                  下一步
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate('/workbench/first-chapter')}>返回黄金路径</Button>
            </HStack>
          </HStack>
        </CardBody>
      </Card>
    </Box>
  )
}
