import { ipcMain, BrowserWindow, app, type IpcMainInvokeEvent } from "electron";
import * as fs from "fs";
import * as path from "path";
import { createCrushAgent } from "./agent";
import { pythonBridge } from "./python-bridge";
import { FragmentInputSchema, AgentConfigSchema, type FragmentInput } from "../shared/types";
import { Value } from "@sinclair/typebox/value";
import type { Agent, AgentEvent } from "@earendil-works/pi-agent-core";
import { loadConfig, saveConfig, type AgentConfig } from "./config";

// 统一的 Slug 格式校验：小写英文、数字、下划线、连字符
function validateCrushSlug(slug: string): boolean {
  return /^[a-z0-9_-]+$/.test(slug) && slug.length >= 1 && slug.length <= 32;
}

// 带超时的 Promise 包装
function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);
}

let currentAgent: Agent | null = null;
let currentSlug: string | null = null;
let unsubscribeStream: (() => void) | null = null;
let isGenerating = false; // 防止重复生成

export function setupIPC(getWindow: () => BrowserWindow | null) {
  // 切换角色
  ipcMain.handle('crush:switch', async (_: IpcMainInvokeEvent, slug: string) => {
    if (!validateCrushSlug(slug)) {
      throw new Error('Invalid crush slug format');
    }

    // 清理旧 Agent
    if (currentAgent) {
      currentAgent.abort();
      currentAgent.reset();
    }
    if (unsubscribeStream) {
      unsubscribeStream();
      unsubscribeStream = null;
    }

    currentAgent = await createCrushAgent(slug);
    currentSlug = slug;
    return { success: true };
  });

  // 创建碎片（完整参数校验）
  ipcMain.handle('fragment:create', async (_: IpcMainInvokeEvent, fragment: FragmentInput) => {
    if (!currentSlug) throw new Error('No crush selected');

    // TypeBox 校验
    if (!Value.Check(FragmentInputSchema, fragment)) {
      throw new Error('Invalid fragment parameters');
    }

    const result = await withTimeout(
      pythonBridge.call('record', currentSlug, JSON.stringify(fragment)),
      10000,
      'Fragment creation timeout'
    );
    return JSON.parse(result);
  });

  // 获取碎片列表（返回值校验）
  ipcMain.handle('fragment:list', async (_: IpcMainInvokeEvent, date: string) => {
    if (!currentSlug) throw new Error('No crush selected');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date format');

    const result = await withTimeout(
      pythonBridge.call('list', currentSlug, date),
      10000,
      'Fragment list timeout'
    );
    const parsed = JSON.parse(result);
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid fragment list response');
    }
    return parsed;
  });

  // 生成叙事（invoke 方式，stream callback 统一处理错误）
  ipcMain.handle('narrative:generate', async (_: IpcMainInvokeEvent, date: string) => {
    // 防止重复生成
    if (isGenerating) {
      throw new Error('Narrative generation already in progress');
    }

    const window = getWindow();
    if (!window || !currentAgent || !currentSlug) {
      throw new Error('Agent not ready');
    }

    isGenerating = true;

    try {
      // 获取碎片上下文
      const context = await withTimeout(
        pythonBridge.call('integrate', currentSlug, date),
        60000,
        'Narrative integration timeout'
      );

      // 清理旧订阅
      if (unsubscribeStream) {
        unsubscribeStream();
      }

      // 订阅 Agent 流式输出，保存 unsubscribe 函数
      unsubscribeStream = currentAgent.subscribe((agentEvent: AgentEvent) => {
        if (agentEvent.type === 'message_update') {
          const delta = agentEvent.assistantMessageEvent;
          if (delta.type === 'text_delta') {
            window.webContents.send('stream:delta', delta.delta);
          }
        }
        if (agentEvent.type === 'agent_end') {
          window.webContents.send('stream:end');
          isGenerating = false;
        }
      });

      // Agent.prompt 带超时保护
      await withTimeout(
        currentAgent.prompt(`基于以下碎片生成叙事：\n${context}`),
        120000,
        'Narrative generation timeout'
      );
      return { success: true };
    } catch (error) {
      isGenerating = false;
      throw error;
    }
  });

  // Agent 配置
  ipcMain.handle('config:get', async () => {
    return loadConfig();
  });

  ipcMain.handle('config:save', async (_: IpcMainInvokeEvent, config: AgentConfig) => {
    // TypeBox 运行时校验
    if (!Value.Check(AgentConfigSchema, config)) {
      throw new Error('Invalid config parameters');
    }
    await saveConfig(config);
    return { success: true };
  });

  // 获取可写入的数据目录（生产环境安全）
  function getDataPath(): string {
    return app.getPath('userData');
  }

  // 保存用户档案
  ipcMain.handle('user:save', async (_: IpcMainInvokeEvent, profile: Record<string, unknown>) => {
    const userDir = path.join(getDataPath(), 'user');

    // 确保 user 目录存在
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    // 生成 profile.md
    const profileMd = `# 用户性格档案

> 由 GUI 自动创建

## 基础信息

- **MBTI**：${profile.mbti || ''}
- **性格标签**：${Array.isArray(profile.personalityTags) ? profile.personalityTags.join('、') : ''}
- **年龄阶段**：${profile.ageStage || ''}
- **职业**：${profile.profession || ''}

## 说话习惯

- **语气词**：${profile.toneWords || ''}
- **口头禅**：${profile.catchphrase || ''}
- **表达偏好**：${profile.expressionStyle || ''}

## 价值观/恋爱观

- **对暗恋的看法**：${profile.crushView || ''}
- **对亲密关系的态度**：${profile.intimacyAttitude || ''}
- **在关系中看重什么**：${profile.relationshipValue || ''}

## 心理特征

- **情绪触发点**：${profile.emotionTriggers || ''}
- **依恋类型**：${profile.attachmentType || ''}
- **应对方式**：${profile.copingStyle || ''}

## 行为偏好

- **喜欢的主角类型**：${profile.protagonistType || ''}
- **喜欢的情感基调**：${profile.emotionalTone || ''}
- **雷区**：${profile.tabooElements || ''}
`;

    // 生成 writing_style.md
    const writingStyleMd = `# 写作风格偏好

> 由 GUI 自动创建

## 视角偏好

- **人称**：${profile.perspective || ''}
- **叙事距离**：${profile.narrativeDistance || ''}

## 情感表达

- **情感浓度**：${profile.emotionalIntensity || ''}
- **内心戏比重**：${profile.innerMonologueRatio || ''}
- **对话风格**：${profile.dialogueStyle || ''}

## 节奏偏好

- **剧情节奏**：${profile.plotPacing || ''}
- **场景转换频率**：${profile.sceneTransition || ''}
- **单日叙事时长覆盖**：${profile.dailyCoverage || ''}

## 偏好标签

- **喜欢的元素**：${profile.favoriteElements || ''}
- **讨厌的元素**：${profile.dislikedElements || ''}
`;

    fs.writeFileSync(path.join(userDir, 'profile.md'), profileMd, 'utf-8');
    fs.writeFileSync(path.join(userDir, 'writing_style.md'), writingStyleMd, 'utf-8');

    return { success: true };
  });

  // 获取角色列表
  ipcMain.handle('crush:list', async () => {
    const crushesDir = path.join(getDataPath(), 'crushes');

    if (!fs.existsSync(crushesDir)) {
      return [];
    }

    const entries = fs.readdirSync(crushesDir, { withFileTypes: true });
    const crushes: Array<{ slug: string; name: string }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const metaPath = path.join(crushesDir, entry.name, 'meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          crushes.push({ slug: entry.name, name: meta.name || entry.name });
        } catch {
          // meta.json 损坏，用目录名作为名称
          crushes.push({ slug: entry.name, name: entry.name });
        }
      }
    }

    return crushes;
  });

  // 创建角色
  ipcMain.handle('crush:create', async (_: IpcMainInvokeEvent, data: Record<string, unknown>) => {
    const slug = data.slug as string;
    const name = data.name as string;

    // 校验 name
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error('Name is required');
    }

    // Slug 格式校验（与 validateCrushSlug 一致）
    if (!validateCrushSlug(slug)) {
      throw new Error('Invalid slug format');
    }

    const crushDir = path.join(getDataPath(), 'crushes', slug);

    // 检查是否已存在
    if (fs.existsSync(crushDir)) {
      throw new Error('Crush already exists');
    }

    // 带清理的文件写入
    try {
      // 创建目录
      fs.mkdirSync(crushDir, { recursive: true });

      const now = new Date().toISOString();

      // 生成 meta.json
      const meta = {
        name: name.trim(),
        nickname: (data.nickname as string) || name.trim(),
        version: '1.0.0',
        created_at: now,
        last_updated: now,
        intimate_enabled: false,
      };

      // 生成 persona.md
      const personality = Array.isArray(data.personality) ? (data.personality as string[]).join('、') : '';
      const personaMd = `# 人物性格

## 基础信息

- **年龄**：
- **职业**：${(data.occupation as string) || ''}
- **性格**：${personality}

## 说话习惯

### 语气词
### 口头禅

## 情绪模式

### 开心时
### 生气时
### 害羞时

## 行为偏好

### 喜欢的事物
### 讨厌的事物

## 认识方式

- **认识时长**：${(data.knowDuration as string) || ''}
- **关系状态**：${(data.relationshipStatus as string) || ''}
- **认识方式**：${(data.howMet as string) || ''}
- **城市**：${(data.city as string) || ''}

## 主观印象

${(data.impression as string) || ''}
`;

      // 生成 memory.md
      const memoryMd = `# 关系记忆

## ${name.trim()} 的基本信息

- **姓名**：
- **年龄**：
- **职业**：${(data.occupation as string) || ''}
- **性格**：${personality}

## 时间线（RELATIONSHIP_START）

- **初次相遇**：
- **关系发展阶段**：

## 关键回忆（KEY_MEMORIES）

### 回忆1：
### 回忆2：
### 回忆3：

## 当前关系状态（CURRENT_STATUS）

当前阶段：${(data.relationshipStatus as string) || ''}
最近互动：
待解决问题：
下一步方向：
`;

      // 生成 SKILL.md
      const skillMd = `---
name: ${slug}
description: ${name.trim()} 的角色 Skill
version: 1.0.0
---

# ${name.trim()} - 角色 Skill

你是一个可运行的 Skill，基于以下文件构建角色：
- \`memory.md\` - 关系记忆
- \`persona.md\` - 人物性格
- \`meta.json\` - 元数据

## 加载角色

通过以下方式加载角色信息：

\`\`\`javascript
const memory = require('./memory.md');
const persona = require('./persona.md');
\`\`\`

## 角色能力

- 关系记忆检索
- 性格模拟
- 对话生成
- 情感分析
`;

      // 写入文件
      fs.writeFileSync(path.join(crushDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
      fs.writeFileSync(path.join(crushDir, 'persona.md'), personaMd, 'utf-8');
      fs.writeFileSync(path.join(crushDir, 'memory.md'), memoryMd, 'utf-8');
      fs.writeFileSync(path.join(crushDir, 'SKILL.md'), skillMd, 'utf-8');

      return { success: true, slug };
    } catch (error) {
      // 写入失败时清理目录
      try {
        if (fs.existsSync(crushDir)) {
          fs.rmSync(crushDir, { recursive: true, force: true });
        }
      } catch {
        // 清理也失败了，记录但不掩盖原始错误
      }
      throw error;
    }
  });
}
