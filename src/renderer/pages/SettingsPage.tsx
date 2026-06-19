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
} from '@chakra-ui/react'

function SettingsPage() {
  const [theme, setTheme] = useState('auto')
  const [language, setLanguage] = useState('zh')
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

  const toast = useToast()

  useEffect(() => {
    // 加载设置
    window.electronAPI.getSettings().then((response: any) => {
      if (response?.success) {
        const settings = response.data
        setTheme(settings.theme || 'auto')
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
      }
    }).catch(() => {
      // 忽略错误，使用默认值
    })
  }, [])

  const handleSave = async () => {
    try {
      await window.electronAPI.updateSettings({
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

      toast({
        title: '保存成功',
        status: 'success',
        duration: 3000,
      })
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

  return (
    <Box p={6}>
      <Heading mb={6}>设置</Heading>

      <Tabs>
        <TabList>
          <Tab>AI 配置</Tab>
          <Tab>提示词</Tab>
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
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </Box>

                <Box>
                  <Text mb={2}>最大 Token 数</Text>
                  <Input
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    min={256}
                    max={128000}
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
