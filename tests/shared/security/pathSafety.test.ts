import * as path from 'path'
import {
  assertSafeDate,
  assertSafeDayNumber,
  assertSafeSlug,
  safeCrushPath,
  safeJoinUnder,
} from '@/shared/security/pathSafety'

describe('path safety', () => {
  test('rejects traversal and absolute slug values', () => {
    expect(() => assertSafeSlug('..')).toThrow()
    expect(() => assertSafeSlug('../outside')).toThrow()
    expect(() => assertSafeSlug('C:\\outside')).toThrow()
  })

  test('keeps resolved crush paths below the project root', () => {
    const projectRoot = path.join('C:', 'tmp', 'yourcrush')
    expect(safeCrushPath(projectRoot, 'demo', 'meta.json')).toBe(
      path.join(projectRoot, 'crushes', 'demo', 'meta.json')
    )
    expect(() => safeCrushPath(projectRoot, '..', 'meta.json')).toThrow()
    expect(() => safeJoinUnder(projectRoot, '..', 'outside')).toThrow()
  })

  test('validates calendar dates and day numbers', () => {
    expect(assertSafeDate('2026-02-28')).toBe('2026-02-28')
    expect(() => assertSafeDate('2026-02-30')).toThrow()
    expect(() => assertSafeDate('2026-02-28/../../outside')).toThrow()

    expect(assertSafeDayNumber(1)).toBe(1)
    expect(() => assertSafeDayNumber(0)).toThrow()
    expect(() => assertSafeDayNumber(-1)).toThrow()
    expect(() => assertSafeDayNumber(1.5)).toThrow()
  })
})
