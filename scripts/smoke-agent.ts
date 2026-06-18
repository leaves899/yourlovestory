/**
 * 冒烟测试脚本 — 验证 Agent 实例能正常构造和运行一次完整 prompt。
 *
 * 运行方式：
 *   # Mock 模式（不需要 API Key，仅验证构造和事件绑定）
 *   npx tsx scripts/smoke-agent.ts --mock
 *
 *   # Live 模式（需要 ANTHROPIC_API_KEY）
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/smoke-agent.ts --live
 *
 * Mock 模式仅验证 Agent 构造、subscribe 注册、state 初始化等不抛错；
 * Live 模式会真正调用 Anthropic API 完成 prompt 周期。
 */
import { Agent } from '@earendil-works/pi-agent-core'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import { getModel } from '@earendil-works/pi-ai'

const useMock = process.argv.includes('--mock')
const useLive = process.argv.includes('--live')

if (!useMock && !useLive) {
  console.log('用法: npx tsx scripts/smoke-agent.ts --mock | --live')
  console.log('  --mock  仅验证 Agent 构造和初始化（不需要 API Key）')
  console.log('  --live  真正调用 Anthropic API（需要 ANTHROPIC_API_KEY）')
  process.exit(1)
}

async function runMockSmokeTest() {
  console.log('🚀 Running agent smoke test (MOCK mode)...')

  // ── 验证 1: getModel 返回有效模型 ──
  const model = getModel('anthropic', 'claude-sonnet-4-20250514')
  console.log(`✅ getModel('anthropic', 'claude-sonnet-4-20250514') 成功`)
  console.log(`   model.id = ${model.id}, model.provider = ${model.provider}, model.api = ${model.api}`)

  // ── 验证 2: Agent 构造不抛错 ──
  const agent = new Agent({
    initialState: {
      systemPrompt: 'You are a helpful assistant for smoke testing.',
      model,
      thinkingLevel: 'off',
    },
  })
  console.log('✅ Agent 构造成功')

  // ── 验证 3: state 初始化 ──
  const state = agent.state
  console.log(`✅ agent.state.systemPrompt 长度 = ${state.systemPrompt.length}`)
  console.log(`   agent.state.isStreaming = ${state.isStreaming}`)
  console.log(`   agent.state.messages.length = ${state.messages.length}`)

  // ── 验证 4: subscribe 注册 ──
  const receivedEvents: string[] = []
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    receivedEvents.push(event.type)
  })
  console.log('✅ subscribe 注册成功')

  // ── 验证 5: steeringMode / followUpMode 赋值 ──
  agent.steeringMode = 'one-at-a-time'
  agent.followUpMode = 'one-at-a-time'
  console.log(`✅ steeringMode = ${agent.steeringMode}, followUpMode = ${agent.followUpMode}`)

  // ── 验证 6: steer / followUp 队列 ──
  agent.steer({ role: 'user', content: 'test steering', timestamp: Date.now() })
  agent.followUp({ role: 'user', content: 'test followUp', timestamp: Date.now() })
  console.log(`✅ hasQueuedMessages = ${agent.hasQueuedMessages()}`)

  agent.clearAllQueues()
  console.log('✅ clearAllQueues() 成功')

  // ── 验证 7: unsubscribe ──
  unsubscribe()
  console.log('✅ unsubscribe() 成功')

  // ── 验证 8: reset ──
  agent.reset()
  console.log('✅ reset() 成功')

  console.log('🎉 Mock smoke test passed!')
}

async function runLiveSmokeTest() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY 环境变量未设置')
    process.exit(1)
  }

  console.log('🚀 Running agent smoke test (LIVE mode)...')

  const agent = new Agent({
    initialState: {
      systemPrompt: 'You are a helpful assistant for smoke testing. Reply with exactly: SMOKE_OK',
      model: getModel('anthropic', 'claude-sonnet-4-20250514'),
      thinkingLevel: 'off',
    },
    toolExecution: 'parallel',
    steeringMode: 'one-at-a-time',
    followUpMode: 'one-at-a-time',
  })

  const receivedEvents: string[] = []

  agent.subscribe((event: AgentEvent) => {
    receivedEvents.push(event.type)

    if (event.type === 'message_update') {
      const e = event.assistantMessageEvent
      if (e.type === 'text_delta') {
        process.stdout.write(e.delta)
      }
    }
  })

  console.log(' Sending prompt: "hello"...')

  try {
    await agent.prompt('hello')
  } catch (err) {
    console.error('\n❌ agent.prompt threw:', err)
    process.exit(1)
  }

  // 验证关键事件
  const requiredEvents = ['message_start', 'agent_end'] as const
  for (const re of requiredEvents) {
    if (receivedEvents.includes(re)) {
      console.log(`\n✅ Received ${re}`)
    } else {
      console.error(`\n❌ Missing ${re} event. Received: ${receivedEvents.join(', ')}`)
      process.exit(1)
    }
  }

  console.log(`   Total events: ${receivedEvents.length}`)
  console.log(`   Messages: ${agent.state.messages.length}`)

  console.log('🎉 Live smoke test passed!')
}

if (useMock) {
  runMockSmokeTest().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
} else {
  runLiveSmokeTest().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}