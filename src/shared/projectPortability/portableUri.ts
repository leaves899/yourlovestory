export function portableSourceUri(uri: string): string | null {
  try {
    const parsed = new URL(uri)
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      || parsed.username.length > 0
      || parsed.password.length > 0
      || parsed.hostname.length === 0
    ) return null
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}

export function isCanonicalPortableSourceUri(value: unknown): value is string | null {
  return value === null
    || (
      typeof value === 'string'
      && value.length <= 16_384
      && portableSourceUri(value) === value
    )
}
