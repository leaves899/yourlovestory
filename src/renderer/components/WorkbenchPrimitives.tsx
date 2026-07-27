import type { ReactNode } from 'react'
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  Heading,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react'
import { FaPlus } from 'react-icons/fa'

interface WorkbenchPageProps {
  eyebrow: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  children: ReactNode
}

export function WorkbenchPage({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
  children,
}: WorkbenchPageProps) {
  return (
    <Box maxW="1500px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 5, md: 8 }}>
      <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} gap={4} mb={7} direction={{ base: 'column', md: 'row' }}>
        <Box>
          <Text fontSize="xs" color="cinnabar.600" fontWeight="bold" letterSpacing="0.12em">{eyebrow}</Text>
          <Heading size="lg" mt={2}>{title}</Heading>
          <Text color="ink.600" mt={2} maxW="760px">{description}</Text>
        </Box>
        {actionLabel && onAction && <Button colorScheme="cinnabar" leftIcon={<FaPlus />} onClick={onAction}>{actionLabel}</Button>}
      </Flex>
      {children}
    </Box>
  )
}

interface WorkbenchErrorProps {
  message: string | null
}

export function WorkbenchError({ message }: WorkbenchErrorProps) {
  if (!message) return null
  return <Alert status="warning" mb={4}><AlertIcon />{message}</Alert>
}

interface WorkbenchLoadingProps {
  label?: string
}

export function WorkbenchLoading({ label = '正在加载。' }: WorkbenchLoadingProps) {
  return <Flex minH="240px" align="center" justify="center"><VStack spacing={3}><Spinner color="cinnabar.500" /><Text color="ink.600">{label}</Text></VStack></Flex>
}

interface WorkbenchEmptyProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
}

export function WorkbenchEmpty({
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: WorkbenchEmptyProps) {
  return (
    <Card>
      <CardBody py={12}>
        <VStack spacing={3} textAlign="center">
          <Text fontWeight="bold" fontSize="lg">{title}</Text>
          <Text color="ink.600" maxW="520px">{description}</Text>
          <Flex gap={2} wrap="wrap" justify="center">
            {actionLabel && onAction && <Button size="sm" colorScheme="cinnabar" onClick={onAction}>{actionLabel}</Button>}
            {secondaryActionLabel && onSecondaryAction && (
              <Button size="sm" variant="outline" onClick={onSecondaryAction}>{secondaryActionLabel}</Button>
            )}
          </Flex>
        </VStack>
      </CardBody>
    </Card>
  )
}

export function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString()
}

export function outlineStatusLabel(status: 'draft' | 'confirmed' | 'locked'): string {
  if (status === 'confirmed') return '已确认'
  if (status === 'locked') return '已锁定'
  return '草稿'
}

export function statusColor(status: string): string {
  if (status === 'locked' || status === 'approved' || status === 'completed') return 'green'
  if (status === 'confirmed' || status === 'review' || status === 'running') return 'orange'
  if (status === 'failed' || status === 'rejected') return 'red'
  return 'gray'
}
