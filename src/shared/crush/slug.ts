/**
 * 角色标识生成与清洗。
 *
 * - 保留中文与常见文字字符
 * - 移除文件系统不安全字符
 * - 将空白折叠为 `-`
 */

function normalizeSlug(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/\.+$/g, '')
}

/**
 * 清洗用户输入的 slug。
 */
export function sanitizeCrushSlug(raw?: string | null): string {
  if (!raw) return ''
  return normalizeSlug(raw)
}

/**
 * 为新角色生成默认 slug。
 */
export function buildDefaultCrushSlug(name?: string, nickname?: string): string {
  const candidates = [nickname, name]

  for (const candidate of candidates) {
    const normalized = sanitizeCrushSlug(candidate)
    if (normalized) {
      return normalized
    }
  }

  return `crush-${Date.now().toString(36)}`
}
