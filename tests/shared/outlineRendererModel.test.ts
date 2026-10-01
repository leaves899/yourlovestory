import { outlineModelInput, readOutlineModelForm } from '@/renderer/components/projectOutlineModel'
import type { ProjectConfig } from '@/shared/novelProject'

const config: ProjectConfig = {
  project_id: 'project-1', default_llm_config_id: null, genre: '', tone: '', target_words: null,
  context_budget: 32000, version: 1, created_at: '', updated_at: '',
  settings: { llmProvider: 'deepseek', llmBaseUrl: 'https://example.invalid/v1', llmModel: 'project-model', llmMaxOutputTokens: 2048, llmTemperature: 0.2, llmCredentialId: 'project:project-1', private_note: 'do not pass project settings to task' },
}

test('大纲只提取项目模型参数，不传凭据引用或任意项目设置', () => {
  const form = readOutlineModelForm(config)
  expect(form).toEqual({ model: 'project-model', contextBudget: '32000', maxOutputTokens: '2048', temperature: '0.2' })
  expect(outlineModelInput(config, form)).toEqual({
    provider: 'deepseek', baseUrl: 'https://example.invalid/v1', model: 'project-model',
    contextBudget: 32000, maxOutputTokens: 2048, temperature: 0.2, streamingEnabled: true,
  })
})

test.each([
  { contextBudget: '0' }, { contextBudget: '12.5' }, { maxOutputTokens: '32000' },
  { maxOutputTokens: '-1' }, { temperature: 'Infinity' }, { temperature: '2.1' }, { model: ' ' },
])('无效大纲模型预算或参数在提交前拒绝 %p', (override) => {
  expect(() => outlineModelInput(config, { ...readOutlineModelForm(config), ...override })).toThrow('请填写模型')
})
