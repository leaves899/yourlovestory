import * as fs from 'node:fs'
import * as path from 'node:path'

const root = path.resolve(__dirname, '../..')

describe('LLM credential IPC and renderer boundary', () => {
  it('does not bridge an API Key read method into the renderer', () => {
    const preload = fs.readFileSync(path.join(root, 'src/main/preload.ts'), 'utf8')
    expect(preload).toContain("'llmCredential:save'")
    expect(preload).toContain("'llmCredential:status'")
    expect(preload).not.toMatch(/getCredential\s*:/)
    expect(preload).not.toMatch(/llmCredential:read/)
  })

  it('never rehydrates a saved API Key in the settings page', () => {
    const settingsPage = fs.readFileSync(path.join(root, 'src/renderer/pages/SettingsPage.tsx'), 'utf8')
    expect(settingsPage).toContain('已安全保存')
    expect(settingsPage).not.toMatch(/setApiKey\([^)]*\.apiKey/)
    expect(settingsPage).toContain("setApiKey('')")
  })
})
