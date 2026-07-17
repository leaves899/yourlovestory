import { createWebContentsTaskEventSink, type TaskEvent } from '@/main/tasks'

describe('Task webContents 事件桥接', () => {
  test('sends each task event on its matching channel', () => {
    const sent: Array<{ channel: string; payload: unknown }> = []
    const sink = createWebContentsTaskEventSink(() => ({
      send: (channel, payload) => sent.push({ channel, payload }),
    }))
    const event: TaskEvent = { type: 'task:chunk', taskId: 'task-1', chunk: '片段' }

    sink.publish(event)

    expect(sent).toEqual([{ channel: 'task:chunk', payload: event }])
  })

  test('does not send after the renderer contents are destroyed', () => {
    const send = jest.fn()
    const sink = createWebContentsTaskEventSink(() => ({
      isDestroyed: () => true,
      send,
    }))

    sink.publish({ type: 'task:error', taskId: 'task-1', error: 'failed' })

    expect(send).not.toHaveBeenCalled()
  })
})
