import React from 'react'
import { Box, Heading, Text, Stack, Link } from '@chakra-ui/react'

function HelpPage() {
  return (
    <Box>
      <Heading mb={4}>帮助</Heading>

      <Stack spacing={6}>
        <Box>
          <Heading size="md" mb={2}>使用说明</Heading>
          <Text>
            yourcrush 是一个恋爱日记应用，帮助你记录与 crush 的日常生活。
          </Text>
        </Box>

        <Box>
          <Heading size="md" mb={2}>功能介绍</Heading>
          <Stack spacing={2}>
            <Text>• 日常写作：生成、编辑、查看日常写作</Text>
            <Text>• 碎片日记：记录、查看、编辑碎片日记</Text>
            <Text>• 角色管理：创建、编辑、删除角色</Text>
            <Text>• 设置：配置应用设置</Text>
          </Stack>
        </Box>

        <Box>
          <Heading size="md" mb={2}>常见问题</Heading>
          <Stack spacing={2}>
            <Text>Q: 如何创建角色？</Text>
            <Text>A: 点击"角色管理"页面，然后点击"创建角色"按钮。</Text>
            <Text>Q: 如何记录碎片？</Text>
            <Text>A: 点击"碎片日记"页面，然后点击"记录碎片"按钮。</Text>
            <Text>Q: 如何生成日常写作？</Text>
            <Text>A: 点击"日常写作"页面，然后点击"生成日常写作"按钮。</Text>
          </Stack>
        </Box>

        <Box>
          <Heading size="md" mb={2}>联系我们</Heading>
          <Text>
            如果你有任何问题或建议，请联系我们：
          </Text>
          <Link href="mailto:support@yourcrush.com" color="blue.500">
            support@yourcrush.com
          </Link>
        </Box>
      </Stack>
    </Box>
  )
}

export default HelpPage
