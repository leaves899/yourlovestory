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

  // API 配置
  const [provider, setProvider] = useState('anthropic')
  const [model, setModel] = useState('claude-sonnet-4-20250514')
  const [apiKey, setApiKey] = useState('')
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
        setApiKey(settings.apiKey || '')
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
        apiKey,
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
                    placeholder="sk-"
                  />
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
