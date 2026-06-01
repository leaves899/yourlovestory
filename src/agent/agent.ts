import { Agent } from '@earendil-works/pi-agent-core'
import { getModel } from '@earendil-works/pi-ai'
import { dayTool } from './tools/dayTool'
import { fragmentTool } from './tools/fragmentTool'
import { crushTool } from './tools/crushTool'

/**
 * Pi Agent 实例
 *
 * 配置：
- 并行执行工具
- 中等思考深度
- 使用 Anthropic Claude 模型
 */
const agent = new Agent({
  initialState: {
    systemPrompt: `你是一个恋爱日记助手，帮助用户记录与 crush 的日常生活。
请使用温暖、细腻的语言，注重心理描写和情感表达。

核心功能：
- 日常写作：生成一天的生活叙事
- 碎片日记：记录零散的恋爱瞬间
- 角色管理：创建和管理 crush 角色

写作原则：
- 三维描写：环境、动作、心理
- 时间标签：## HH:MM · 事件
- 禁止破折号「——」
- 禁止过度省略号「...」
- 细腻的心理描写和情感表达`,
    model: getModel('anthropic', 'claude-sonnet-4-20250514'),
    thinkingLevel: 'medium',
    tools: [dayTool, fragmentTool, crushTool],
  },
  toolExecution: 'parallel',
  steeringMode: 'one-at-a-time',
  followUpMode: 'one-at-a-time',
})

agent.subscribe((event) => {
  switch (event.type) {
    case 'message_start':
      console.log('开始处理消息...')
      break
    case 'message_update':
      process.stdout.write(event.assistantMessageEvent.delta)
      break
    case 'tool_execution_start':
      console.log(`执行工具: ${event.toolName}`)
      break
    case 'tool_execution_end':
      console.log(`工具执行完成: ${event.toolName}`)
      break
    case 'agent_end':
      console.log('处理完成')
      break
  }
})

export { agent }
