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
  useToast,
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
    deepseek: ['deepseek-chat', 'deepseek-coder'],
  }

  return (
    <Box p={6}>
      <Heading mb={6}>设置</Heading>

      {/* API 配置 */}
      <Box mb={8} p={4} bg="gray.50" borderRadius="md">
        <Heading size="md" mb={4}>AI 配置</Heading>
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

      {/* 外观设置 */}
      <Box mb={8} p={4} bg="gray.50" borderRadius="md">
        <Heading size="md" mb={4}>外观</Heading>
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

      <Button colorScheme="blue" onClick={handleSave} size="lg">
        保存设置
      </Button>
    </Box>
  )
}

export default SettingsPage
