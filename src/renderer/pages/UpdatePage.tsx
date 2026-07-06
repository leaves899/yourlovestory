import { useState, useEffect } from 'react'
import { Box, Button, Heading, Text, Stack, useToast } from '@chakra-ui/react'
import { InkPage, InkPanel } from '../components/InkDesign'

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
    <InkPage
      title="更新"
      eyebrow="UPDATE"
      subtitle="查看当前客户端版本，确认桌面应用是否需要更新。"
    >
      <Stack spacing={6}>
        {appInfo && (
          <InkPanel>
            <Heading size="md" mb={2}>应用信息</Heading>
            <Text>名称: {appInfo.name}</Text>
            <Text>版本: {appInfo.version}</Text>
            <Text>平台: {appInfo.platform}</Text>
            <Text>架构: {appInfo.arch}</Text>
          </InkPanel>
        )}

        <Box>
          <Button
            colorScheme="cinnabar"
            onClick={handleCheckUpdate}
            isLoading={checking}
            loadingText="检查中"
          >
            检查更新
          </Button>
        </Box>

        {updateInfo && (
          <InkPanel>
            <Heading size="md" mb={2}>更新信息</Heading>
            {updateInfo.hasUpdate ? (
              <>
                <Text>发现新版本: {updateInfo.version}</Text>
                <Button mt={4} colorScheme="bamboo">
                  下载更新
                </Button>
              </>
            ) : (
              <Text>已是最新版本</Text>
            )}
          </InkPanel>
        )}
      </Stack>
    </InkPage>
  )
}

export default UpdatePage
