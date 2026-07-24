import * as fs from 'fs'
import * as path from 'path'

/** Error thrown when an untrusted path component is outside its allowed scope. */
export class UnsafePathError extends Error {
  readonly code = 'UNSAFE_PATH'

  constructor(message: string) {
    super(message)
    this.name = 'UnsafePathError'
  }
}

const INVALID_SLUG_CHARS = /[<>:"/\\|?*]/

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code >= 0 && code <= 0x1f) return true
  }
  return false
}

/**
 * Validate a crush slug before it is used as a directory name.
 *
 * Slugs are intentionally validated rather than silently normalised here. The
 * create flow may normalise user input, but read/update/delete flows must never
 * turn an attacker-controlled path into a different target.
 */
export function assertSafeSlug(slug: string): string {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new UnsafePathError('Crush slug is required')
  }

  const normalized = slug.normalize('NFKC')
  if (
    normalized !== slug ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.trim() !== normalized ||
    normalized.length > 128 ||
    INVALID_SLUG_CHARS.test(normalized) ||
    containsControlCharacter(normalized) ||
    normalized.endsWith('.') ||
    normalized.endsWith(' ')
  ) {
    throw new UnsafePathError(`Invalid crush slug: ${slug}`)
  }

  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) {
    throw new UnsafePathError(`Invalid crush slug: ${slug}`)
  }

  return normalized
}

/** Return whether a value is a valid slug without throwing. */
export function isSafeSlug(slug: string): boolean {
  try {
    assertSafeSlug(slug)
    return true
  } catch {
    return false
  }
}

/** Validate an ISO calendar date used as a fragment filename. */
export function assertSafeDate(date: string): string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new UnsafePathError(`Invalid date: ${date}`)
  }

  const [year, month, day] = date.split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new UnsafePathError(`Invalid date: ${date}`)
  }

  return date
}

/** Return whether a value is a valid calendar date without throwing. */
export function isSafeDate(date: string): boolean {
  try {
    assertSafeDate(date)
    return true
  } catch {
    return false
  }
}

/** Validate the numeric day identifier used in memories/chats/day<N>.md. */
export function assertSafeDayNumber(dayNumber: number): number {
  if (!Number.isSafeInteger(dayNumber) || dayNumber < 1) {
    throw new UnsafePathError(`Invalid day number: ${dayNumber}`)
  }
  return dayNumber
}

function assertContained(basePath: string, targetPath: string): void {
  const base = path.resolve(basePath)
  const target = path.resolve(targetPath)
  const relative = path.relative(base, target)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new UnsafePathError(`Path escapes base directory: ${targetPath}`)
  }
}

function nearestExistingPath(inputPath: string): string {
  let current = inputPath
  while (!fs.existsSync(current) && current !== path.dirname(current)) {
    current = path.dirname(current)
  }
  return current
}

/** Resolve a path below a trusted base directory and reject traversal. */
export function safeJoinUnder(basePath: string, ...segments: string[]): string {
  const base = path.resolve(basePath)
  const target = path.resolve(base, ...segments)
  assertContained(base, target)

  // If an existing directory or one of its ancestors is a symlink, validate
  // the real path too. When the requested base does not exist yet, compare the
  // nearest existing ancestors so normal recursive directory creation remains
  // valid.
  const existingBase = nearestExistingPath(base)
  const existingTarget = nearestExistingPath(target)
  if (fs.existsSync(existingBase) && fs.existsSync(existingTarget)) {
    const realBase = fs.realpathSync.native(existingBase)
    const realTarget = fs.realpathSync.native(existingTarget)
    assertContained(realBase, realTarget)
  }

  return target
}

/** Resolve a crush-scoped path under <projectRoot>/crushes/<slug>. */
export function safeCrushPath(
  projectRoot: string,
  slug: string,
  ...segments: string[]
): string {
  const safeSlug = assertSafeSlug(slug)
  const crushesDir = safeJoinUnder(projectRoot, 'crushes')
  return safeJoinUnder(crushesDir, safeSlug, ...segments)
}
