import React, { useState, useEffect } from 'react'
import {
  Box,
  Button,
  Heading,
  Stack,
  Text,
  Select,
  Switch,
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
import { useAppStore } from '../stores/appStore'

function SettingsPage() {
  const [theme, setTheme] = useState('auto')
  const [language, setLanguage] = useState('zh')
  const { colorMode, setColorMode } = useColorMode()
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
  const [currentPhase, setCurrentPhase] = useState(0)

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
          setCurrentPhase(response.data.current_phase)
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

  const defaultSystemPrompt = `## 写作规则

### 叙事格式
- 以第一人称视角写作（"我"的视角）
- 使用 ## HH:MM · 标题 格式标注时间节点
- 每个时间节点描写一个独立的场景或事件
- 篇幅在 2000-4000 字之间，要足够详细和丰富

### 三维描写原则
- **环境描写**：场景的氛围、光线、声音、气味
- **动作描写**：人物的行为、肢体语言、微表情
- **心理描写**：内心的感受、想法、情绪波动

### 禁止事项
- 禁止使用破折号「——」，用逗号或分号替代
- 禁止过度使用省略号「...」，每篇不超过 1 处
- 禁止直接复制用户摘要原文，要展开为完整叙事
- 禁止输出空泛的概括，必须描写具体场景`

  const defaultUserPromptTemplate = `请为角色「{slug}」生成第 {dayNumber} 天的恋爱日记叙事。

当天摘要：{summary}

要求：
- 以第一人称"我"的视角写作
- 使用 ## HH:MM · 标题 格式标注时间节点
- 包含完整的环境、动作、心理三维描写
- 根据当天摘要展开具体的场景和互动
- 篇幅在 2000-4000 字之间，要足够详细和丰富
- 结尾以 ## 23:59 · 入睡 收尾`

  // 阶段专属提示词
  const phasePrompts: Record<number, { name: string; color: string; description: string; rules: string }> = {
    0: {
      name: '陌生人',
      color: 'gray',
      description: '单方面关注，几乎没有交集',
      rules: `## Phase 0 陌生人阶段 - 观察者视角

你是一个细腻的观察者，记录用户对 TA 的单方面关注。

### 写作重点
- 外貌描写：TA 的穿着、发型、表情细节
- 环境细节：相遇的场景、氛围、光线
- 内心活动：用户的心理活动、想象、期待

### 语气风格
- 克制：不过度表达情感
- 细腻：注重细节描写
- 略带忧伤：单方面关注的距离感

### 禁止事项
- 不要描写双方的互动（此阶段为单方面关注）
- 不要使用过于亲密的词汇
- 保持观察者的距离感`,
    },
    1: {
      name: '认识',
      color: 'blue',
      description: '有基本互动，知道彼此存在',
      rules: `## Phase 1 认识阶段 - 互动视角

你是一个善于捕捉互动细节的叙述者，记录用户与 TA 的初次互动。

### 写作重点
- 对话内容：聊天的具体内容、语气词
- 反应描写：TA 的表情变化、肢体语言
- 小动作：不经意的细节、习惯性动作
- 初次互动的紧张感：心跳加速、手足无措

### 语气风格
- 轻松：日常互动的自然感
- 好奇：对 TA 的探索和了解
- 略带期待：对未来互动的期待

### 特殊处理
- 描写对话时使用引号，保持口语化
- 注意捕捉尴尬和有趣的瞬间
- 展现关系从陌生到熟悉的过程`,
    },
    2: {
      name: '暧昧',
      color: 'pink',
      description: '频繁互动，有情感张力',
      rules: `## Phase 2 暧昧阶段 - 情感视角

你是一个情感细腻的叙述者，擅长描写暧昧期的微妙张力。

### 写作重点
- 眼神交汇：对视的瞬间、眼神中的含义
- 肢体语言：不经意的触碰、靠近、保护动作
- 未说出口的话：欲言又止、暗示、试探
- 情感波动：忽远忽近的不确定性、患得患失

### 语气风格
- 暧昧：充满暗示和双关
- 期待：渴望关系进一步发展
- 略带不安：不确定性带来的焦虑

### 特殊处理
- 大量使用心理描写，展现内心的纠结和期待
- 描写"差一点就说出口"的瞬间
- 注意捕捉暧昧的边界感`,
    },
    3: {
      name: '表白',
      color: 'red',
      description: '明确关系，正式在一起',
      rules: `## Phase 3 表白阶段 - 结局视角

你是一个浪漫的故事讲述者，正在书写这段关系的高潮。

### 写作重点
- 情感爆发：压抑已久的情感终于释放
- 告白场景：精心设计或 spontaneous 的表白时刻
- 对方的回应：惊喜、感动、接受
- 关系确立：从暧昧到恋人的转变

### 语气风格
- 热烈：情感的高潮
- 真诚：发自内心的表达
- 充满希望：对未来的憧憬

### 特殊处理
- 表白场景要足够细腻和感人
- 描写双方的情感变化
- 为后续的恋人关系做铺垫`,
    },
    4: {
      name: '热恋',
      color: 'purple',
      description: '时时刻刻都想亲密，形影不离',
      rules: `## Phase 4 热恋阶段 - 激情视角

你是一个激情四射的叙述者，正在书写这段关系最热烈的篇章。

### 写作重点
- 无时无刻的亲密：随时随地的亲吻、拥抱、触碰
- 情感的极致表达：爱意如潮水般汹涌澎湃
- 身体的渴望：时时刻刻都想更亲近、更深入
- 甜蜜的腻歪：形影不离、如胶似漆

### 语气风格
- 热烈：情感的极致爆发
- 缠绵：难舍难分的依恋
- 大胆：不掩饰任何欲望和渴望

### 特殊处理
- 描写随时随地的亲密行为（走廊、厨房、沙发、电梯...）
- 展现双方对彼此身体的极度渴望
- 描写"一刻也等不了"的急切感
- 展现热恋中的甜蜜腻歪和无尽缠绵`,
    },
  }

  return (
    <Box p={6}>
      <Heading mb={6}>设置</Heading>

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
            <Box p={4} bg="gray.50" borderRadius="md">
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
                    placeholder="sk-..."
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
            </Box>
          </TabPanel>

          {/* 提示词配置 */}
          <TabPanel>
            <Stack spacing={6}>
              <Box p={4} bg="gray.50" borderRadius="md">
                <Heading size="sm" mb={2}>自定义系统提示词</Heading>
                <Text fontSize="sm" color="gray.500" mb={4}>
                  追加到默认写作规则之后。留空则使用默认规则。
                </Text>
                <Textarea
                  value={customSystemPrompt}
                  onChange={(e) => setCustomSystemPrompt(e.target.value)}
                  placeholder={defaultSystemPrompt}
                  minH="200px"
                />
              </Box>

              <Box p={4} bg="gray.50" borderRadius="md">
                <Heading size="sm" mb={2}>自定义用户提示词模板</Heading>
                <Text fontSize="sm" color="gray.500" mb={2}>
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
                  placeholder={defaultUserPromptTemplate}
                  minH="200px"
                />
              </Box>
            </Stack>
          </TabPanel>

          {/* 阶段提示词 */}
          <TabPanel>
            <Stack spacing={6}>
              <Box p={4} bg="gray.50" borderRadius="md">
                <Heading size="sm" mb={2}>当前阶段</Heading>
                <Text fontSize="sm" color="gray.500" mb={4}>
                  根据关系进度自动切换的专属写作规则
                </Text>
                {phasePrompts[currentPhase] ? (
                  <HStack spacing={2}>
                    <Badge colorScheme={phasePrompts[currentPhase].color} fontSize="md" px={3} py={1}>
                      {phasePrompts[currentPhase].name}
                    </Badge>
                    <Text fontSize="sm" color="gray.600">
                      {phasePrompts[currentPhase].description}
                    </Text>
                  </HStack>
                ) : (
                  <Text fontSize="sm" color="gray.500">
                    暂无阶段数据
                  </Text>
                )}
              </Box>

              <Accordion allowMultiple>
                {Object.entries(phasePrompts).map(([phase, prompt]) => (
                  <AccordionItem key={phase}>
                    <h2>
                      <AccordionButton>
                        <Box flex="1" textAlign="left">
                          <HStack>
                            <Badge colorScheme={prompt.color}>
                              {prompt.name}
                            </Badge>
                            <Text fontSize="sm">
                              {prompt.description}
                            </Text>
                            {Number(phase) === currentPhase && (
                              <Badge colorScheme="green" ml={2}>当前</Badge>
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
                        borderColor="gray.200"
                        whiteSpace="pre-wrap"
                        fontSize="sm"
                        fontFamily="monospace"
                      >
                        {prompt.rules}
                      </Box>
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            </Stack>
          </TabPanel>

          {/* 外观设置 */}
          <TabPanel>
            <Box p={4} bg="gray.50" borderRadius="md">
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
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Button colorScheme="blue" onClick={handleSave} size="lg" mt={6}>
        保存设置
      </Button>
    </Box>
  )
}

export default SettingsPage
