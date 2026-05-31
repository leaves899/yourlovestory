import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { type AgentConfig, DEFAULT_AGENT_CONFIG } from '../../shared/types';

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'minimax-cn', label: 'MiniMax (CN)' },
  { value: 'xiaomi', label: 'Xiaomi' },
  { value: 'moonshotai', label: 'Moonshot AI' },
  { value: 'moonshotai-cn', label: 'Moonshot AI (CN)' },
  { value: 'xai', label: 'xAI' },
  { value: 'groq', label: 'Groq' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'github-copilot', label: 'GitHub Copilot' },
];

export function AgentConfigPage() {
  const setPage = useAppStore((s) => s.setPage);
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.electron.getConfig().then((c) => {
      if (c && typeof c === 'object') {
        setConfig({ ...DEFAULT_AGENT_CONFIG, ...c });
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electron.saveConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="agent-config">
      <div className="agent-config__header">
        <button className="agent-config__back" onClick={() => setPage('startup')}>
          ← 返回
        </button>
        <h1 className="agent-config__title">Agent 配置</h1>
      </div>

      <div className="agent-config__body">
        <div className="config-field">
          <label className="config-field__label">Provider</label>
          <select
            className="config-field__select"
            value={config.provider}
            onChange={(e) => update('provider', e.target.value)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="config-field">
          <label className="config-field__label">Model</label>
          <input
            className="config-field__input"
            type="text"
            value={config.model}
            onChange={(e) => update('model', e.target.value)}
            placeholder="claude-sonnet-4-20250514"
          />
        </div>

        <div className="config-field">
          <label className="config-field__label">API Key</label>
          <input
            className="config-field__input config-field__input--password"
            type="password"
            value={config.apiKey}
            onChange={(e) => update('apiKey', e.target.value)}
            placeholder="sk-..."
          />
        </div>

        <div className="config-field">
          <label className="config-field__label">Base URL <span className="config-field__hint">（可选，自定义端点）</span></label>
          <input
            className="config-field__input"
            type="text"
            value={config.baseUrl}
            onChange={(e) => update('baseUrl', e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>

        <div className="config-field">
          <label className="config-field__label">
            Temperature: <span className="config-field__value">{config.temperature.toFixed(2)}</span>
          </label>
          <input
            className="config-field__range"
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={config.temperature}
            onChange={(e) => update('temperature', parseFloat(e.target.value))}
          />
          <div className="config-field__range-labels">
            <span>精确 0</span>
            <span>创意 2</span>
          </div>
        </div>

        <div className="config-field">
          <label className="config-field__label">Max Tokens</label>
          <input
            className="config-field__input"
            type="number"
            min={256}
            max={128000}
            step={256}
            value={config.maxTokens}
            onChange={(e) => update('maxTokens', parseInt(e.target.value) || 4096)}
          />
        </div>

        <div className="agent-config__actions">
          <button
            className="agent-config__save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : saved ? '✓ 已保存' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
}
