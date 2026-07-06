import { Box, Heading, Stack, Text, Alert, AlertIcon, AlertTitle, AlertDescription } from '@chakra-ui/react'

function HelpPage() {
  return (
    <Box maxW="760px" data-testid="help-page">
      <Heading mb={4}>帮助</Heading>

      <Stack spacing={6}>
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <Box>
            <AlertTitle>从哪里开始最顺</AlertTitle>
            <AlertDescription>
              第一次使用时，先完成角色创建和关系起点设置。完成后进入关系页，再决定是先记碎片，还是先写第一篇 Day。
            </AlertDescription>
          </Box>
        </Alert>

        <Box>
          <Heading size="md" mb={2}>这个客户端里有什么</Heading>
          <Stack spacing={2}>
            <Text>角色管理：创建和维护你的角色资料。</Text>
            <Text>碎片日记：记录一句话、一个动作、一次相处的最小片段。</Text>
            <Text>日常写作：把当天的线索扩展成完整叙事。</Text>
            <Text>关系进度：查看当前处在什么阶段，以及接下来值得做什么。</Text>
          </Stack>
        </Box>

        <Box>
          <Heading size="md" mb={2}>推荐使用顺序</Heading>
          <Stack spacing={2}>
            <Text>1. 创建角色并选择关系起点。</Text>
            <Text>2. 进入关系页，看清当前阶段和下一步建议。</Text>
            <Text>3. 去碎片日记记第一条片段，或者直接在日常写作里开始第一篇 Day。</Text>
            <Text>4. 随着内容积累，再回到关系页观察阶段变化。</Text>
          </Stack>
        </Box>

        <Box>
          <Heading size="md" mb={2}>关于数据与状态</Heading>
          <Stack spacing={2}>
            <Text>所有角色资料、碎片、Day 与关系进度都保存在本地目录。</Text>
            <Text>更新页当前主要用于查看版本信息，不承担自动更新闭环。</Text>
            <Text>如果某个页面提示还没有角色，通常意味着你还没完成首次设置，或当前没有选中角色。</Text>
          </Stack>
        </Box>
      </Stack>
    </Box>
  )
}

export default HelpPage
