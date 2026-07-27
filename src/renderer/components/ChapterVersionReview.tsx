import {
  Alert,
  AlertIcon,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react'
import type { ChapterVersion } from '../../shared/chapterGeneration'
import { statusColor } from './WorkbenchPrimitives'

interface ChapterVersionReviewProps {
  version: ChapterVersion
  busyAction?: 'confirm' | 'reject' | null
  onConfirm: (version: ChapterVersion) => void
  onReject: (version: ChapterVersion) => void
  onRevise: (version: ChapterVersion) => void
}

export function ChapterVersionReview({
  version,
  busyAction = null,
  onConfirm,
  onReject,
  onRevise,
}: ChapterVersionReviewProps) {
  const hasBlockingFinding = version.fact_check.findings.some(
    (finding) => finding.severity === 'error',
  )
  return (
    <Card variant="outline" data-testid={`chapter-version-${version.id}`}>
      <CardHeader>
        <HStack justify="space-between">
          <HStack>
            <Text fontWeight="bold">版本 {version.version_number}</Text>
            <Badge colorScheme={statusColor(version.status)}>{version.status}</Badge>
          </HStack>
          {version.status === 'review' && (
            <HStack>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReject(version)}
                isLoading={busyAction === 'reject'}
                isDisabled={busyAction !== null}
              >
                拒绝版本
              </Button>
              <Button
                size="sm"
                colorScheme="cinnabar"
                onClick={() => onConfirm(version)}
                isLoading={busyAction === 'confirm'}
                isDisabled={hasBlockingFinding || busyAction !== null}
                data-testid="confirm-chapter-version"
              >
                确认版本
              </Button>
            </HStack>
          )}
        </HStack>
      </CardHeader>
      <CardBody>
        <Stack spacing={5}>
          <Stack>
            <Text fontWeight="bold">章节摘要</Text>
            <Text color="ink.700">{version.summary || '本版本没有提供摘要。'}</Text>
          </Stack>
          <Stack>
            <Text fontWeight="bold">正文</Text>
            <Text whiteSpace="pre-wrap" lineHeight="1.9" data-testid="review-chapter-content">{version.content}</Text>
          </Stack>
          <Alert status={version.fact_check.passed ? 'success' : 'warning'}>
            <AlertIcon />
            <Stack>
              <Text fontWeight="bold">{version.fact_check.passed ? '事实核查通过' : '事实核查需要复核'}</Text>
              <Text fontSize="sm">{version.fact_check.summary}</Text>
            </Stack>
          </Alert>
          {hasBlockingFinding && (
            <Alert status="error" data-testid="fact-check-blocks-confirmation">
              <AlertIcon />
              <Text flex={1}>存在错误级事实核查结果，请先修订正文或拒绝此版本。</Text>
              <Button size="sm" variant="outline" onClick={() => onRevise(version)}>
                返回章节修订
              </Button>
            </Alert>
          )}
          <Stack spacing={3} data-testid="fact-check-findings">
            {version.fact_check.findings.length === 0 && <Text color="ink.600">没有事实核查 finding。</Text>}
            {version.fact_check.findings.map((finding, index) => (
              <Card key={`${finding.claim}-${index}`} variant="outline">
                <CardBody>
                  <Stack spacing={2}>
                    <HStack>
                      <Badge colorScheme={finding.severity === 'error' ? 'red' : finding.severity === 'warning' ? 'orange' : 'blue'}>
                        {finding.severity}
                      </Badge>
                      <Text fontWeight="bold">{finding.claim}</Text>
                    </HStack>
                    <Text fontSize="sm">证据：{finding.evidence}</Text>
                    <Text fontSize="sm" color="cinnabar.700">
                      修改建议：{finding.suggestion || '请根据证据核对正文与大纲，并决定是否修订。'}
                    </Text>
                  </Stack>
                </CardBody>
              </Card>
            ))}
          </Stack>
        </Stack>
      </CardBody>
    </Card>
  )
}
