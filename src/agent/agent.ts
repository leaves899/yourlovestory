import { Agent } from '@earendil-works/pi-agent-core'
import { getModel } from '@earendil-works/pi-ai'
import { dayTool } from './tools/dayTool'
import { fragmentTool } from './tools/fragmentTool'
import { crushTool } from './tools/crushTool'

const agent = new Agent({
  initialState: {
    systemPrompt: `你是一个恋爱日记助手，帮助用户记录与 crush 的日常生活。
请使用温暖、细腻的语言，注重心理描写和情感表达。`,
    model: getModel('anthropic', 'claude-sonnet-4-20250514'),
    thinkingLevel: 'medium',
  },
  toolExecution: 'parallel',
  steeringMode: 'one-at-a-time',
  followUpMode: 'one-at-a-time',
})

agent.state.tools = [dayTool, fragmentTool, crushTool]

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
