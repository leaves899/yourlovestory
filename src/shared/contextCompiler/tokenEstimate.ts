/**
 * Conservative, deterministic mixed CJK/Latin token estimator.
 *
 * Method (`cjk1_latin4_utf8_ceil`):
 * - Walk Unicode code points (not UTF-16 surrogates as pairs incorrectly).
 * - Each CJK / fullwidth ideographic code point costs 1 token (≈ real LLM cost for Han).
 * - Contiguous non-CJK runs cost ceil(run_utf8_bytes / 4) (ASCII-like packing).
 * - Non-empty text is at least 1.
 *
 * This is intentionally an upper-bound-ish estimate vs chars/4 on Chinese, not a model tokenizer.
 */
export const TOKEN_ESTIMATION_METHOD = 'cjk1_latin4_utf8_ceil' as const

export const TOKEN_ESTIMATION_NOTE =
  'Deterministic conservative estimate: 1 token per CJK/fullwidth code point; ' +
  'non-CJK runs use ceil(UTF-8 byte length / 4); empty=0, non-empty min 1. Not a model tokenizer.'

const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x3400, 0x4dbf], // CJK Extension A
  [0x4e00, 0x9fff], // CJK Unified
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0x3000, 0x303f], // CJK Symbols and Punctuation
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0xac00, 0xd7af], // Hangul Syllables
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms
]

function isCjkOrFullwidth(codePoint: number): boolean {
  for (const [start, end] of CJK_RANGES) {
    if (codePoint >= start && codePoint <= end) return true
  }
  // CJK Extension B+ (supplementary planes common for rare Han)
  if (codePoint >= 0x20000 && codePoint <= 0x2ceaf) return true
  return false
}

/** UTF-8 byte length of a single code point. */
function utf8BytesForCodePoint(codePoint: number): number {
  if (codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
}

function flushLatinRun(byteLength: number): number {
  if (byteLength <= 0) return 0
  return Math.ceil(byteLength / 4)
}

export function estimateTextTokens(text: string): number {
  if (text.length === 0) return 0
  let tokens = 0
  let latinBytes = 0
  for (const char of text) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined) continue
    if (isCjkOrFullwidth(codePoint)) {
      tokens += flushLatinRun(latinBytes)
      latinBytes = 0
      tokens += 1
    } else {
      latinBytes += utf8BytesForCodePoint(codePoint)
    }
  }
  tokens += flushLatinRun(latinBytes)
  return Math.max(1, tokens)
}

export function estimateLinesTokens(lines: readonly string[]): number {
  return estimateTextTokens(lines.join('\n'))
}

/** Tokens for joining already-estimated sections with a fixed separator (re-estimates full join). */
export function estimateJoinedTextTokens(
  parts: readonly string[],
  separator = '\n\n',
): number {
  if (parts.length === 0) return 0
  if (parts.length === 1) return estimateTextTokens(parts[0] ?? '')
  return estimateTextTokens(parts.join(separator))
}
