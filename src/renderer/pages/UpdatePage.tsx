import React, { useState, useEffect } from 'react'
import { Box, Button, Heading, Text, Stack, useToast } from '@chakra-ui/react'

function UpdatePage() {
  const [appInfo, setAppInfo] = useState<any>(null)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [checking, setChecking] = useState(false)
  const toast = useToast()

  useEffect(() => {
    window.electronAPI.getAppInfo().then((info: any) => {
      setAppInfo(info)
    })
  }, [])

  const handleCheckUpdate = async () => {
    setChecking(true)
    try {
      const response = await window.electronAPI.checkUpdate()
      setUpdateInfo(response)

      if (response.hasUpdate) {
        toast({
          title: '发现新版本',
          description: `新版本 ${response.version} 可用`,
          status: 'info',
          duration: 5000,
        })
      } else {
        toast({
          title: '已是最新版本',
          status: 'success',
          duration: 3000,
        })
      }
    } catch (error: any) {
      toast({
        title: '检查更新失败',
        description: error.message,
        status: 'error',
        duration: 3000,
      })
    } finally {
      setChecking(false)
    }
  }

  return (
    <Box>
      <Heading mb={4}>更新</Heading>

      <Stack spacing={6}>
        {appInfo && (
          <Box>
            <Heading size="md" mb={2}>应用信息</Heading>
            <Text>名称: {appInfo.name}</Text>
            <Text>版本: {appInfo.version}</Text>
            <Text>平台: {appInfo.platform}</Text>
            <Text>架构: {appInfo.arch}</Text>
          </Box>
        )}

        <Box>
          <Button
            colorScheme="blue"
            onClick={handleCheckUpdate}
            isLoading={checking}
            loadingText="检查中..."
          >
            检查更新
          </Button>
        </Box>

        {updateInfo && (
          <Box>
            <Heading size="md" mb={2}>更新信息</Heading>
            {updateInfo.hasUpdate ? (
              <>
                <Text>发现新版本: {updateInfo.version}</Text>
                <Button mt={4} colorScheme="green">
                  下载更新
                </Button>
              </>
            ) : (
              <Text>已是最新版本</Text>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}

export default UpdatePage
