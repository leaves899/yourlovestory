import React, { useState, useEffect } from 'react'
import {
  Box,
  Button,
  Heading,
  Stack,
  Text,
  Select,
  Switch,
  useToast,
} from '@chakra-ui/react'

function SettingsPage() {
  const [theme, setTheme] = useState('auto')
  const [language, setLanguage] = useState('zh')
  const [storagePath, setStoragePath] = useState('')
  const [backupEnabled, setBackupEnabled] = useState(false)
  const [backupPath, setBackupPath] = useState('')
  const toast = useToast()

  useEffect(() => {
    // 加载设置
    window.electronAPI.getSettings().then((response: any) => {
      if (response.success) {
        const settings = response.data
        setTheme(settings.theme || 'auto')
        setLanguage(settings.language || 'zh')
        setStoragePath(settings.storagePath || '')
        setBackupEnabled(settings.backupEnabled || false)
        setBackupPath(settings.backupPath || '')
      }
    })
  }, [])

  const handleSave = async () => {
    try {
      const response = await window.electronAPI.updateSettings({
        theme,
        language,
        storagePath,
        backupEnabled,
        backupPath,
      })

      if (response.success) {
        toast({
          title: '保存成功',
          status: 'success',
          duration: 3000,
        })
      } else {
        toast({
          title: '保存失败',
          description: response.errors?.[0],
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

  return (
    <Box>
      <Heading mb={4}>设置</Heading>

      <Stack spacing={6}>
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

        <Box>
          <Text mb={2}>存储路径</Text>
          <Text>{storagePath || '默认路径'}</Text>
        </Box>

        <Box>
          <Text mb={2}>自动备份</Text>
          <Switch
            isChecked={backupEnabled}
            onChange={(e) => setBackupEnabled(e.target.checked)}
          />
        </Box>

        {backupEnabled && (
          <Box>
            <Text mb={2}>备份路径</Text>
            <Text>{backupPath || '默认路径'}</Text>
          </Box>
        )}

        <Button colorScheme="blue" onClick={handleSave}>
          保存
        </Button>
      </Stack>
    </Box>
  )
}

export default SettingsPage
