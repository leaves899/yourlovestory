import { useEffect, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Center,
  Heading,
  HStack,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react'
import type {
  BackupRecord,
  BackupVerificationResult,
  DatabaseStatus,
} from '../../shared/backup/types'

interface DatabaseRecoveryPageProps {
  status: DatabaseStatus
  onRecheck: () => Promise<void>
}

export default function DatabaseRecoveryPage({
  status,
  onRecheck,
}: DatabaseRecoveryPageProps) {
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [verification, setVerification] = useState<Record<string, BackupVerificationResult>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false)
  const isBusy = busyId !== null
  const toast = useToast()

  const loadBackups = async () => {
    const response = await window.electronAPI.listBackups()
    if (!response.success) {
      throw new Error(response.error?.message ?? '无法读取数据库备份。')
    }
    setBackups(response.data ?? [])
  }

  useEffect(() => {
    void loadBackups().catch((error: unknown) => {
      toast({
        title: '无法加载备份',
        description: error instanceof Error ? error.message : '请重试。',
        status: 'error',
      })
    })
  }, [])

  const verify = async (backup: BackupRecord) => {
    setBusyId(backup.id)
    try {
      const response = await window.electronAPI.verifyBackup(backup.id)
      if (!response.success || !response.data) {
        throw new Error(response.error?.message ?? '备份校验失败。')
      }
      setVerification((current) => ({ ...current, [backup.id]: response.data! }))
    } catch (error: unknown) {
      toast({
        title: '备份校验失败',
        description: error instanceof Error ? error.message : '请重试。',
        status: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  const restore = async (backup: BackupRecord) => {
    if (!window.confirm('确定恢复此数据库备份吗？应用将安全重启。')) return
    setBusyId(backup.id)
    try {
      const response = await window.electronAPI.restoreBackup(backup.id, true)
      if (!response.success) {
        throw new Error(response.error?.message ?? '数据库恢复失败。')
      }
    } catch (error: unknown) {
      setBusyId(null)
      toast({
        title: '数据库恢复失败',
        description: error instanceof Error ? error.message : '请重试。',
        status: 'error',
      })
    }
  }

  const exportDiagnostics = async () => {
    setDiagnosticsBusy(true)
    try {
      const response = await window.electronAPI.exportDiagnostics()
      if (!response.success || !response.data) {
        throw new Error(response.error?.message ?? '导出诊断包失败。')
      }
      if (response.data.canceled) {
        toast({ title: '已取消导出诊断包', status: 'info' })
        return
      }
      toast({
        title: '诊断包已导出',
        description: `${response.data.fileName}（${response.data.size} 字节）`,
        status: 'success',
      })
    } catch (error: unknown) {
      toast({
        title: '导出诊断包失败',
        description: error instanceof Error ? error.message : '请重试。',
        status: 'error',
      })
    } finally {
      setDiagnosticsBusy(false)
    }
  }

  return (
    <Center minH="100vh" bg="paper.100" p={6} data-testid="database-recovery-page">
      <Box maxW="760px" w="full" bg="white" borderWidth="1px" borderRadius="xl" p={8}>
        <Stack spacing={6}>
          <Box>
            <Text fontSize="sm" color="cinnabar.600" fontWeight="bold">DATABASE RECOVERY</Text>
            <Heading size="lg">数据库恢复中心</Heading>
          </Box>
          <Alert status={status.state === 'credential-migration-required' ? 'warning' : 'error'}>
            <AlertIcon />
            <AlertDescription data-testid="recovery-status">
              {status.message ?? '数据库需要恢复后才能继续使用。'}
            </AlertDescription>
          </Alert>
          <HStack>
            <Badge>{status.state}</Badge>
            <Text fontSize="sm">完整性：{status.integrity}</Text>
          </HStack>
          <Stack spacing={3} data-testid="recovery-backup-list">
            {backups.length === 0 && <Text color="gray.600">没有可用的数据库备份。</Text>}
            {backups.map((backup) => (
              <Box key={backup.id} borderWidth="1px" borderRadius="md" p={4}>
                <HStack justify="space-between" align="start">
                  <Box>
                    <Text fontWeight="semibold">{new Date(backup.createdAt).toLocaleString()}</Text>
                    <Text fontSize="sm" color="gray.600">
                      {backup.reason} · Schema {backup.schemaVersion} · {backup.size.toLocaleString()} bytes
                    </Text>
                    {verification[backup.id] && (
                      <Text fontSize="sm" color={verification[backup.id].valid ? 'green.600' : 'red.600'}>
                        {verification[backup.id].valid ? '校验通过' : verification[backup.id].error}
                      </Text>
                    )}
                  </Box>
                  <HStack>
                    <Button
                      size="sm"
                      onClick={() => void verify(backup)}
                      isLoading={busyId === backup.id}
                      isDisabled={isBusy}
                      data-testid={`recovery-verify-${backup.id}`}
                    >
                      校验
                    </Button>
                    <Button
                      size="sm"
                      colorScheme="red"
                      onClick={() => void restore(backup)}
                      isDisabled={isBusy
                        || status.state === 'credential-migration-required'
                        || status.state === 'restoring'}
                      isLoading={busyId === backup.id}
                      data-testid={`recovery-restore-${backup.id}`}
                    >
                      恢复
                    </Button>
                  </HStack>
                </HStack>
              </Box>
            ))}
          </Stack>
          <HStack>
            <Button
              variant="outline"
              onClick={() => void onRecheck()}
              isDisabled={isBusy || diagnosticsBusy}
              data-testid="recovery-recheck"
            >
              重新检查数据库状态
            </Button>
            <Button
              variant="outline"
              onClick={() => void exportDiagnostics()}
              isLoading={diagnosticsBusy}
              isDisabled={isBusy || diagnosticsBusy}
              data-testid="recovery-export-diagnostics"
            >
              导出脱敏诊断包
            </Button>
          </HStack>
        </Stack>
      </Box>
    </Center>
  )
}
