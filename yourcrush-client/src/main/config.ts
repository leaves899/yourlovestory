import { app, safeStorage } from 'electron';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { type AgentConfig, DEFAULT_AGENT_CONFIG } from '../shared/types';

// 重新导出类型
export type { AgentConfig };

function getConfigPath(): string {
  return join(app.getPath('userData'), 'agent-config.json');
}

function getApiKeyPath(): string {
  return join(app.getPath('userData'), 'api-key.enc');
}

export async function loadConfig(): Promise<AgentConfig> {
  try {
    const data = await readFile(getConfigPath(), 'utf-8');
    const config = { ...DEFAULT_AGENT_CONFIG, ...JSON.parse(data) };

    // 尝试解密 API Key
    try {
      const encrypted = await readFile(getApiKeyPath());
      if (encrypted.length > 0 && safeStorage.isEncryptionAvailable()) {
        config.apiKey = safeStorage.decryptString(encrypted);
      }
    } catch {
      // 加密文件不存在或解密失败，使用配置中的 apiKey（向后兼容）
    }

    return config;
  } catch {
    return { ...DEFAULT_AGENT_CONFIG };
  }
}

export async function saveConfig(config: AgentConfig): Promise<void> {
  const dir = join(getConfigPath(), '..');
  await mkdir(dir, { recursive: true });

  // 分离 API Key 和其他配置
  const { apiKey, ...otherConfig } = config;

  // 保存非敏感配置
  await writeFile(getConfigPath(), JSON.stringify(otherConfig, null, 2), 'utf-8');

  // 加密保存 API Key
  if (apiKey && safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(apiKey);
    await writeFile(getApiKeyPath(), encrypted);
  } else if (apiKey) {
    // 如果加密不可用，回退到明文存储（向后兼容）
    const configWithKey = { ...otherConfig, apiKey };
    await writeFile(getConfigPath(), JSON.stringify(configWithKey, null, 2), 'utf-8');
  }
}
