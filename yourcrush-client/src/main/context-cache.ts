import { readFile } from 'fs/promises';
import { join } from 'path';

interface CachedContext {
  content: string;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5分钟
const MAX_CACHE_SIZE = 10;        // LRU 容量上限
const contextCache = new Map<string, CachedContext>();

export async function loadCrushContext(crushSlug: string): Promise<string> {
  const cached = contextCache.get(crushSlug);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.content;
  }

  // LRU：缓存满时删除最老条目
  if (contextCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = contextCache.keys().next().value;
    if (oldestKey) contextCache.delete(oldestKey);
  }

  const baseDir = join(__dirname, '../../../yourcrush');
  const [skill, persona, memory] = await Promise.all([
    readFile(join(baseDir, '.claude/skills/day/SKILL.md'), 'utf-8'),
    readFile(join(baseDir, `crushes/${crushSlug}/persona.md`), 'utf-8'),
    readFile(join(baseDir, `crushes/${crushSlug}/memory.md`), 'utf-8'),
  ]);

  const content = `${skill}\n\n---\n\n# 角色性格\n${persona}\n\n# 关系记忆\n${memory}`;
  contextCache.set(crushSlug, { content, timestamp: Date.now() });
  return content;
}