import { useState, useEffect } from 'react'
import {
  Box,
  Button,
  Heading,
  Stack,
  Text,
  Select,
  Input,
  Textarea,
  useToast,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Badge,
  HStack,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  useColorMode,
} from '@chakra-ui/react'
import {
  DEFAULT_SYSTEM_PROMPT_RULES,
  DEFAULT_USER_PROMPT_TEMPLATE,
} from '../../shared/ai/promptBuilder'
import { InkPage, InkPanel } from '../components/InkDesign'
import {
  PHASE_PROMPT_CONFIG,
  PHASE_PROMPT_ORDER,
} from '../../shared/relationship/phase_prompts'
import type { RelationshipPhase } from '../../shared/relationship/models'
import { useAppStore } from '../stores/appStore'
import type {
  BackupRecord,
  BackupRetentionPolicy,
  BackupVerificationResult,
  DatabaseStatus,
} from '../../shared/backup/types'
import { DEFAULT_BACKUP_RETENTION_POLICY } from '../../shared/backup/types'

const PHASE_COLORS: Record<RelationshipPhase, string> = {
  0: 'ink',
  1: 'bamboo',
  2: 'cinnabar',
  3: 'cinnabar',
  4: 'bamboo',
}

function SettingsPage() {
  const [theme, setTheme] = useState('auto')
  const [language, setLanguage] = useState('zh')
  const { setColorMode } = useColorMode()
  const [storagePath, setStoragePath] = useState('')
  const [backupEnabled, setBackupEnabled] = useState(false)
  const [backupPath, setBackupPath] = useState('')
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [verificationById, setVerificationById] = useState<
    Record<string, BackupVerificationResult>
  >({})
  const [maxBackupsInput, setMaxBackupsInput] = useState(
    String(DEFAULT_BACKUP_RETENTION_POLICY.maxBackups),
  )
  const [maxAgeDaysInput, setMaxAgeDaysInput] = useState(
    String(DEFAULT_BACKUP_RETENTION_POLICY.maxAgeDays),
  )
  const [policyBusy, setPolicyBusy] = useState(false)
  const [policyMessage, setPolicyMessage] = useState<string | null>(null)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false)

  // API 配置
  const [provider, setProvider] = useState('anthropic')
  const [model, setModel] = useState('claude-sonnet-4-20250514')
  const [apiKey, setApiKey] = useState('')
  const [credentialConfigured, setCredentialConfigured] = useState(false)
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const [credentialBusy, setCredentialBusy] = useState(false)
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4096)

  // 自定义提示词
  const [customSystemPrompt, setCustomSystemPrompt] = useState('')
  const [customUserPromptTemplate, setCustomUserPromptTemplate] = useState('')

  // 关系进度
  const { activeSlug } = useAppStore()
  const [currentPhase, setCurrentPhase] = useState<RelationshipPhase>(0)

  const toast = useToast()

  useEffect(() => {
    // 加载设置
    window.electronAPI.getSettings().then((response: any) => {
      if (response?.success) {
        const settings = response.data
        const savedTheme = settings.theme || 'auto'
        setTheme(savedTheme)
        setLanguage(settings.language || 'zh')
        setStoragePath(settings.storagePath || '')
        setBackupEnabled(settings.backupEnabled || false)
        setBackupPath(settings.backupPath || '')
        setProvider(settings.provider || 'anthropic')
        setModel(settings.model || 'claude-sonnet-4-20250514')
        // Saved credentials are deliberately never returned to renderer.
        setApiKey('')
        setCredentialConfigured(Boolean(settings.credential?.configured))
        setCredentialError(settings.credential?.error?.message ?? null)
        setTemperature(settings.temperature || 0.7)
        setMaxTokens(settings.maxTokens || 4096)
        setCustomSystemPrompt(settings.customSystemPrompt || '')
        setCustomUserPromptTemplate(settings.customUserPromptTemplate || '')

        // 应用主题设置
        if (savedTheme === 'dark') {
          setColorMode('dark')
        } else if (savedTheme === 'light') {
          setColorMode('light')
        }
        // 'auto' 使用系统默认
      }
    }).catch(() => {
      // 忽略错误，使用默认值
    })
    window.electronAPI.getLlmCredentialStatus({ scope: 'app' }).then((response) => {
      if (response.success && response.data) {
        setCredentialConfigured(response.data.configured)
        setCredentialError(response.data.error?.message ?? null)
      }
    }).catch(() => setCredentialError('无法检查系统安全存储。'))
  }, [])

  const loadDataSafety = async () => {
    const [statusResult, backupResult, policyResult] = await Promise.all([
      window.electronAPI.getDatabaseStatus(),
      window.electronAPI.listBackups(),
      window.electronAPI.getBackupPolicy(),
    ])
    if (statusResult.success && statusResult.data) setDatabaseStatus(statusResult.data)
    if (backupResult.success && backupResult.data) setBackups(backupResult.data)
    if (policyResult.success && policyResult.data) {
      setMaxBackupsInput(String(policyResult.data.policy.maxBackups))
      setMaxAgeDaysInput(String(policyResult.data.policy.maxAgeDays))
      setPolicyError(null)
    } else if (!policyResult.success) {
      setPolicyError(policyResult.error?.message ?? '无法读取备份保留策略。')
    }
  }

  useEffect(() => {
    void loadDataSafety().catch(() => {
      setDatabaseStatus((current) => current ?? {
        state: 'recovery-required',
        integrity: 'unknown',
        schemaVersion: null,
        message: '无法读取数据库状态。',
        lastBackupAt: null,
        backupAllowed: false,
        backupEligibility: 'database-unavailable',
        backupBlockedReason: '无法读取数据库状态。',
      })
    })
  }, [])

  // 加载关系进度
  useEffect(() => {
    if (activeSlug) {
      window.electronAPI.relationshipProgress(activeSlug).then((response: any) => {
        if (response?.success) {
          setCurrentPhase(response.data.current_phase as RelationshipPhase)
        }
      }).catch(() => {
        // 忽略错误
      })
    }
  }, [activeSlug])

  const handleSave = async () => {
    try {
      const result = await window.electronAPI.updateSettings({
        theme,
        language,
        storagePath,
        backupEnabled,
        backupPath,
        provider,
        model,
        temperature,
        maxTokens,
        customSystemPrompt,
        customUserPromptTemplate,
      })

      if (result?.success) {
        // 应用主题设置
        if (theme === 'dark') {
          setColorMode('dark')
        } else if (theme === 'light') {
          setColorMode('light')
        }
        // 'auto' 使用系统默认

        toast({
          title: '保存成功',
          status: 'success',
          duration: 3000,
        })
      } else {
        toast({
          title: '保存失败',
          description: result?.errors?.[0] || '未知错误',
          status: 'error',
          duration: 3000,
        })
      }
    } catch (error: any) {
      toast({
        title: '保存失败',
        description: error.message,
        status: 'error',
        duration: 3000,
      })
    }
  }

  const saveCredential = async () => {
    const secret = apiKey.trim()
    if (!secret) {
      toast({ title: '请输入新的 API Key', status: 'warning', duration: 3000 })
      return
    }
    setCredentialBusy(true)
    try {
      const result = await window.electronAPI.saveLlmCredential({ scope: 'app' }, secret)
      if (!result.success) throw new Error(result.error?.message ?? '凭据保存失败')
      setCredentialConfigured(true)
      setCredentialError(null)
      toast({ title: 'API Key 已安全保存', status: 'success', duration: 3000 })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '凭据保存失败'
      setCredentialError(message)
      toast({ title: '凭据保存失败', description: message, status: 'error', duration: 4000 })
    } finally {
      // Shorten renderer plaintext lifetime even when the operation fails.
      setApiKey('')
      setCredentialBusy(false)
    }
  }

  const testCredential = async () => {
    setCredentialBusy(true)
    try {
      const result = await window.electronAPI.testLlmCredential({ scope: 'app' })
      if (!result.success) throw new Error(result.error?.message ?? '连接测试失败')
      toast({ title: result.data?.message ?? '连接测试成功', status: 'success', duration: 3000 })
    } catch (error: unknown) {
      toast({ title: '连接测试失败', description: error instanceof Error ? error.message : '请检查网络和配置。', status: 'error', duration: 4000 })
    } finally {
      setCredentialBusy(false)
    }
  }

  const deleteCredential = async (all: boolean) => {
    const confirmation = all ? '确定删除全部模型凭据吗？此操作不可撤销。' : '确定删除当前日记模型凭据吗？'
    if (!window.confirm(confirmation)) return
    setCredentialBusy(true)
    try {
      const result = all
        ? await window.electronAPI.deleteAllLlmCredentials()
        : await window.electronAPI.deleteLlmCredential({ scope: 'app' })
      if (!result.success) throw new Error(result.error?.message ?? '删除凭据失败')
      setCredentialConfigured(false)
      setCredentialError(null)
      toast({ title: all ? '已删除全部模型凭据' : '已删除 API Key', status: 'success', duration: 3000 })
    } catch (error: unknown) {
      toast({ title: '删除凭据失败', description: error instanceof Error ? error.message : '请重试。', status: 'error', duration: 4000 })
    } finally {
      setCredentialBusy(false)
    }
  }

  const createDatabaseBackup = async () => {
    setBackupBusy(true)
    try {
      const result = await window.electronAPI.createBackup()
      if (!result.success) throw new Error(result.error?.message ?? '创建备份失败')
      await loadDataSafety()
      toast({ title: '数据库备份已创建', status: 'success', duration: 3000 })
    } catch (error: unknown) {
      toast({
        title: '创建备份失败',
        description: error instanceof Error ? error.message : '请重试。',
        status: 'error',
        duration: 4000,
      })
    } finally {
      setBackupBusy(false)
    }
  }

  const verifyDatabaseBackup = async (id: string) => {
    setBackupBusy(true)
    try {
      const result = await window.electronAPI.verifyBackup(id)
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? '校验备份失败')
      }
      const verification = result.data
      setVerificationById((current) => ({ ...current, [id]: verification }))
    } catch (error: unknown) {
      toast({
        title: '校验备份失败',
        description: error instanceof Error ? error.message : '请重试。',
        status: 'error',
        duration: 4000,
      })
    } finally {
      setBackupBusy(false)
    }
  }

  const restoreDatabaseBackup = async (backup: BackupRecord) => {
    if (!window.confirm(
      `确定恢复 ${new Date(backup.createdAt).toLocaleString()} 的数据库备份吗？应用将安全重启。`,
    )) return
    setBackupBusy(true)
    try {
      const result = await window.electronAPI.restoreBackup(backup.id, true)
      if (!result.success) throw new Error(result.error?.message ?? '恢复备份失败')
      toast({ title: '数据库已恢复，应用正在重启', status: 'success', duration: 3000 })
    } catch (error: unknown) {
      toast({
        title: '恢复备份失败',
        description: error instanceof Error ? error.message : '当前应用不会退出，请重试。',
        status: 'error',
        duration: 5000,
      })
      setBackupBusy(false)
    }
  }

  const saveBackupPolicy = async () => {
    const maxBackups = Number(maxBackupsInput)
    const maxAgeDays = Number(maxAgeDaysInput)
    const policy: BackupRetentionPolicy = { maxBackups, maxAgeDays }
    setPolicyBusy(true)
    setPolicyMessage(null)
    setPolicyError(null)
    try {
      const result = await window.electronAPI.updateBackupPolicy(policy)
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? '保存备份保留策略失败')
      }
      setMaxBackupsInput(String(result.data.policy.maxBackups))
      setMaxAgeDaysInput(String(result.data.policy.maxAgeDays))
      await loadDataSafety()
      if (!result.data.pruneCompleted) {
        setPolicyMessage('策略已保存，但清理失败或未完成。')
        toast({
          title: '策略已保存',
          description: '过期备份清理未完成，请稍后重试。',
          status: 'warning',
          duration: 5000,
        })
      } else if (result.data.prunePartialFailure) {
        setPolicyMessage('策略已保存，但部分过期备份清理失败。')
        toast({
          title: '策略已保存',
          description: '部分过期备份清理失败，请稍后重试。',
          status: 'warning',
          duration: 5000,
        })
      } else {
        setPolicyMessage('备份保留策略已保存。')
        toast({ title: '备份保留策略已保存', status: 'success', duration: 3000 })
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '保存备份保留策略失败'
      setPolicyError(message)
      toast({ title: '保存备份保留策略失败', description: message, status: 'error', duration: 4000 })
    } finally {
      setPolicyBusy(false)
    }
  }

  const exportDiagnostics = async () => {
    setDiagnosticsBusy(true)
    try {
      const result = await window.electronAPI.exportDiagnostics()
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? '导出诊断包失败')
      }
      if (result.data.canceled) {
        toast({ title: '已取消导出诊断包', status: 'info', duration: 2500 })
        return
      }
      toast({
        title: '诊断包已导出',
        description: `${result.data.fileName}（${result.data.size} 字节）`,
        status: 'success',
        duration: 4000,
      })
    } catch (error: unknown) {
      toast({
        title: '导出诊断包失败',
        description: error instanceof Error ? error.message : '请重试。',
        status: 'error',
        duration: 4000,
      })
    } finally {
      setDiagnosticsBusy(false)
    }
  }

  const models: Record<string, string[]> = {
    anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    google: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    deepseek: ['deepseek-v4-flash', 'deepseek-v3.2', 'deepseek-chat', 'deepseek-coder'],
  }
  const currentPhasePrompt = PHASE_PROMPT_CONFIG[currentPhase]

  return (
    <InkPage
      title="设置"
      eyebrow="SETTINGS"
      subtitle="调整模型、提示词和外观偏好，保持这些配置像案头工具一样安静可控。"
    >
      <Tabs>
        <TabList>
          <Tab>AI 配置</Tab>
          <Tab>提示词</Tab>
          <Tab>阶段提示词</Tab>
          <Tab>数据安全</Tab>
          <Tab>外观</Tab>
        </TabList>

        <TabPanels>
          {/* AI 配置 */}
          <TabPanel>
            <InkPanel>
              <Stack spacing={4}>
                <Box>
                  <Text mb={2}>AI 提供商</Text>
                  <Select value={provider} onChange={(e) => {
                    setProvider(e.target.value)
                    const newModels = models[e.target.value]
                    if (newModels?.length) setModel(newModels[0])
                  }}>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="openai">OpenAI (GPT)</option>
                    <option value="google">Google (Gemini)</option>
                    <option value="deepseek">DeepSeek</option>
                  </Select>
                </Box>

                <Box>
                  <Text mb={2}>模型</Text>
                  <Select value={model} onChange={(e) => setModel(e.target.value)}>
                    {(models[provider] || []).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                </Box>

                <Box>
                  <Text mb={2}>API Key</Text>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={credentialConfigured ? '已安全保存。输入新值可替换。' : '输入 API Key'}
                  />
                  <Text mt={2} fontSize="sm" color={credentialError ? 'red.500' : 'ink.500'}>
                    {credentialError ?? (credentialConfigured ? '已安全保存，不会回填到输入框。' : '尚未配置 API Key。')}
                  </Text>
                  <HStack mt={3} spacing={2} flexWrap="wrap">
                    <Button size="sm" colorScheme="cinnabar" isLoading={credentialBusy} onClick={() => void saveCredential()}>
                      {credentialConfigured ? '替换并安全保存' : '安全保存'}
                    </Button>
                    <Button size="sm" variant="outline" isDisabled={!credentialConfigured || credentialBusy} onClick={() => void testCredential()}>测试连接</Button>
                    <Button size="sm" variant="outline" colorScheme="red" isDisabled={!credentialConfigured || credentialBusy} onClick={() => void deleteCredential(false)}>删除凭据</Button>
                    <Button size="sm" variant="ghost" colorScheme="red" isLoading={credentialBusy} onClick={() => void deleteCredential(true)}>删除全部模型凭据</Button>
                  </HStack>
                </Box>

                <Box>
                  <Text mb={2}>Temperature: {temperature}</Text>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val)) {
                        setTemperature(val)
                      }
                    }}
                    style={{ width: '100%' }}
                  />
                </Box>

                <Box>
                  <Text mb={2}>最大 Token 数</Text>
                  <Input
                    type="number"
                    value={maxTokens}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      if (!isNaN(val)) {
                        setMaxTokens(val)
                      }
                    }}
                    min={256}
                    max={200000}
                  />
                </Box>
              </Stack>
            </InkPanel>
          </TabPanel>

          {/* 提示词配置 */}
          <TabPanel>
            <Stack spacing={6}>
              <InkPanel>
                <Heading size="sm" mb={2}>自定义系统提示词</Heading>
                <Text fontSize="sm" color="ink.500" mb={4}>
                  追加到默认写作规则之后。留空则使用默认规则。
                </Text>
                <Textarea
                  value={customSystemPrompt}
                  onChange={(e) => setCustomSystemPrompt(e.target.value)}
                  placeholder={DEFAULT_SYSTEM_PROMPT_RULES}
                  minH="200px"
                />
              </InkPanel>

              <InkPanel>
                <Heading size="sm" mb={2}>自定义用户提示词模板</Heading>
                <Text fontSize="sm" color="ink.500" mb={2}>
                  替换默认的用户提示词。可用变量：
                </Text>
                <Stack direction="row" spacing={4} mb={4}>
                  <code>{'{slug}'}</code>
                  <code>{'{dayNumber}'}</code>
                  <code>{'{summary}'}</code>
                </Stack>
                <Textarea
                  value={customUserPromptTemplate}
                  onChange={(e) => setCustomUserPromptTemplate(e.target.value)}
                  placeholder={DEFAULT_USER_PROMPT_TEMPLATE}
                  minH="200px"
                />
              </InkPanel>
            </Stack>
          </TabPanel>

          {/* 阶段提示词 */}
          <TabPanel>
            <Stack spacing={6}>
              <InkPanel>
                <Heading size="sm" mb={2}>当前阶段</Heading>
                <Text fontSize="sm" color="ink.500" mb={4}>
                  根据关系进度自动切换的专属写作规则
                </Text>
                {currentPhasePrompt ? (
                  <HStack spacing={2}>
                    <Badge colorScheme={PHASE_COLORS[currentPhase]} fontSize="md" px={3} py={1}>
                      {currentPhasePrompt.name}
                    </Badge>
                    <Text fontSize="sm" color="ink.600">
                      {currentPhasePrompt.description}
                    </Text>
                  </HStack>
                ) : (
                  <Text fontSize="sm" color="ink.500">
                    暂无阶段数据
                  </Text>
                )}
              </InkPanel>

              <Accordion allowMultiple>
                {PHASE_PROMPT_ORDER.map((phase) => {
                  const prompt = PHASE_PROMPT_CONFIG[phase]

                  return (
                  <AccordionItem key={phase}>
                    <h2>
                      <AccordionButton>
                        <Box flex="1" textAlign="left">
                          <HStack>
                            <Badge colorScheme={PHASE_COLORS[phase]}>
                              {prompt.name}
                            </Badge>
                            <Text fontSize="sm">
                              {prompt.description}
                            </Text>
                            {phase === currentPhase && (
                              <Badge colorScheme="bamboo" ml={2}>当前</Badge>
                            )}
                          </HStack>
                        </Box>
                        <AccordionIcon />
                      </AccordionButton>
                    </h2>
                    <AccordionPanel pb={4}>
                      <Box
                        p={4}
                        bg="white"
                        borderRadius="md"
                        border="1px"
                        borderColor="ink.200"
                        whiteSpace="pre-wrap"
                        fontSize="sm"
                        fontFamily="monospace"
                      >
                        {prompt.rules}
                      </Box>
                    </AccordionPanel>
                  </AccordionItem>
                  )
                })}
              </Accordion>
            </Stack>
          </TabPanel>

          {/* 数据安全 */}
          <TabPanel>
            <Stack spacing={6}>
              <InkPanel>
                <HStack justify="space-between" align="start">
                  <Box>
                    <Heading size="sm">数据库状态</Heading>
                    <Text mt={2} fontSize="sm" color="ink.600">
                      完整性：{databaseStatus?.integrity ?? 'unknown'}
                      {databaseStatus?.schemaVersion === null
                        ? ''
                        : ` · Schema ${databaseStatus?.schemaVersion ?? 0}`}
                    </Text>
                    {databaseStatus?.message && (
                      <Text mt={2} fontSize="sm" color="red.500">
                        {databaseStatus.message}
                      </Text>
                    )}
                  </Box>
                  <Badge colorScheme={databaseStatus?.state === 'ready' ? 'green' : 'red'}>
                    {databaseStatus?.state ?? 'unknown'}
                  </Badge>
                </HStack>
                <Button
                  mt={4}
                  size="sm"
                  colorScheme="cinnabar"
                  isLoading={backupBusy}
                  isDisabled={databaseStatus?.state !== 'ready'}
                  onClick={() => void createDatabaseBackup()}
                >
                  立即备份
                </Button>
              </InkPanel>

              <InkPanel>
                <Heading size="sm" mb={4}>备份保留策略</Heading>
                <Text fontSize="sm" color="ink.600" mb={4}>
                  控制自动与手动数据库备份的最大份数和最长保留天数。策略由主进程校验并持久化，默认 10 份 / 30 天。
                </Text>
                <Stack spacing={4} data-testid="backup-policy-form">
                  <Box>
                    <Text mb={2} fontSize="sm">最大备份数量（1-100）</Text>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={maxBackupsInput}
                      onChange={(event) => setMaxBackupsInput(event.target.value)}
                      isDisabled={policyBusy}
                      data-testid="backup-policy-max-backups"
                    />
                  </Box>
                  <Box>
                    <Text mb={2} fontSize="sm">最大保留天数（1-3650）</Text>
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      step={1}
                      value={maxAgeDaysInput}
                      onChange={(event) => setMaxAgeDaysInput(event.target.value)}
                      isDisabled={policyBusy}
                      data-testid="backup-policy-max-age-days"
                    />
                  </Box>
                  <Button
                    size="sm"
                    colorScheme="cinnabar"
                    isLoading={policyBusy}
                    isDisabled={backupBusy || diagnosticsBusy}
                    onClick={() => void saveBackupPolicy()}
                    data-testid="backup-policy-save"
                  >
                    保存保留策略
                  </Button>
                  {policyMessage && (
                    <Text fontSize="sm" color="green.600" data-testid="backup-policy-success">
                      {policyMessage}
                    </Text>
                  )}
                  {policyError && (
                    <Text fontSize="sm" color="red.500" data-testid="backup-policy-error">
                      {policyError}
                    </Text>
                  )}
                </Stack>
              </InkPanel>

              <InkPanel>
                <Heading size="sm" mb={4}>数据库备份</Heading>
                <Stack spacing={3}>
                  {backups.length === 0 && (
                    <Text fontSize="sm" color="ink.500">暂无可用备份。</Text>
                  )}
                  {backups.map((backup) => {
                    const verification = verificationById[backup.id]
                    return (
                      <Box key={backup.id} borderWidth="1px" borderRadius="md" p={4}>
                        <HStack justify="space-between" align="start">
                          <Box>
                            <Text fontWeight="semibold">
                              {new Date(backup.createdAt).toLocaleString()}
                            </Text>
                            <Text fontSize="sm" color="ink.500">
                              {backup.reason} · {(backup.size / 1024).toFixed(1)} KB
                              {verification
                                ? ` · ${verification.valid ? '校验通过' : '校验失败'}`
                                : ' · 尚未校验'}
                            </Text>
                          </Box>
                          <HStack>
                            <Button
                              size="xs"
                              variant="outline"
                              isDisabled={backupBusy || policyBusy}
                              onClick={() => void verifyDatabaseBackup(backup.id)}
                            >
                              校验
                            </Button>
                            <Button
                              size="xs"
                              colorScheme="red"
                              variant="outline"
                              isDisabled={backupBusy || policyBusy}
                              onClick={() => void restoreDatabaseBackup(backup)}
                            >
                              恢复
                            </Button>
                          </HStack>
                        </HStack>
                      </Box>
                    )
                  })}
                </Stack>
              </InkPanel>

              <InkPanel>
                <Heading size="sm" mb={2}>脱敏诊断包</Heading>
                <Text fontSize="sm" color="ink.600" mb={4}>
                  导出仅含应用版本、平台、数据库状态、备份策略与聚合统计的脱敏 JSON。默认排除正文、私密记录、凭据和本机路径。
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={diagnosticsBusy}
                  isDisabled={backupBusy || policyBusy}
                  onClick={() => void exportDiagnostics()}
                  data-testid="export-diagnostics"
                >
                  导出脱敏诊断包
                </Button>
              </InkPanel>
            </Stack>
          </TabPanel>

          {/* 外观设置 */}
          <TabPanel>
            <InkPanel>
              <Stack spacing={4}>
                <Box>
                  <Text mb={2}>主题</Text>
                  <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                    <option value="auto">自动</option>
                  </Select>
                </Box>

                <Box>
                  <Text mb={2}>语言</Text>
                  <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="zh">中文</option>
                    <option value="en">英文</option>
                  </Select>
                </Box>
              </Stack>
            </InkPanel>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Button colorScheme="cinnabar" onClick={handleSave} size="lg" mt={6}>
        保存设置
      </Button>
    </InkPage>
  )
}

export default SettingsPage
