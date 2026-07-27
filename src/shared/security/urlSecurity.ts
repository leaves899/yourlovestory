export const INVALID_LLM_BASE_URL = 'INVALID_LLM_BASE_URL' as const
export const INSECURE_LLM_BASE_URL = 'INSECURE_LLM_BASE_URL' as const
export const LOCAL_HTTP_ONLY = 'LOCAL_HTTP_ONLY' as const
export const CROSS_ORIGIN_LLM_REDIRECT = 'CROSS_ORIGIN_LLM_REDIRECT' as const

export type LlmBaseUrlErrorCode =
  | typeof INVALID_LLM_BASE_URL
  | typeof INSECURE_LLM_BASE_URL
  | typeof LOCAL_HTTP_ONLY
  | typeof CROSS_ORIGIN_LLM_REDIRECT

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308])

const INVALID_ENDPOINT_MESSAGE =
  '模型端点无效。请输入完整的 HTTPS 地址，或用于本地开发的 HTTP 地址。'
const INSECURE_ENDPOINT_MESSAGE =
  '远程模型端点必须使用 HTTPS。HTTP 仅允许 localhost、127.0.0.1 或 ::1 的本地开发服务器。'
const LOCAL_HTTP_MESSAGE =
  'HTTP 模型端点仅允许 localhost、127.0.0.1 或 ::1 的本地开发服务器。'

type FetchInput = Parameters<typeof fetch>[0]

export class LlmEndpointSecurityError extends Error {
  public constructor(
    public readonly code: LlmBaseUrlErrorCode,
    message: string,
    public readonly codes: readonly LlmBaseUrlErrorCode[] = [code],
  ) {
    super(message)
    this.name = 'LlmEndpointSecurityError'
  }
}

// 保持与现有配置校验 API 兼容，调用方可以继续按 base URL 错误处理。
export class LlmBaseUrlValidationError extends LlmEndpointSecurityError {
  public constructor(
    code: LlmBaseUrlErrorCode,
    message: string,
    codes?: readonly LlmBaseUrlErrorCode[],
  ) {
    super(code, message, codes)
    this.name = 'LlmBaseUrlValidationError'
  }
}

export interface ModelEndpoint {
  url: URL
  normalized: string
  hostname: string
  isLocal: boolean
}

interface ParsedModelEndpoint {
  url: URL
  hostname: string
  isLocal: boolean
}

function invalidEndpoint(): LlmBaseUrlValidationError {
  return new LlmBaseUrlValidationError(INVALID_LLM_BASE_URL, INVALID_ENDPOINT_MESSAGE)
}

function insecureEndpoint(): LlmBaseUrlValidationError {
  return new LlmBaseUrlValidationError(
    INSECURE_LLM_BASE_URL,
    INSECURE_ENDPOINT_MESSAGE,
    [INSECURE_LLM_BASE_URL, LOCAL_HTTP_ONLY],
  )
}

function localHttpOnlyEndpoint(): LlmBaseUrlValidationError {
  return new LlmBaseUrlValidationError(LOCAL_HTTP_ONLY, LOCAL_HTTP_MESSAGE)
}

function crossOriginRedirect(): LlmBaseUrlValidationError {
  return new LlmBaseUrlValidationError(
    CROSS_ORIGIN_LLM_REDIRECT,
    '模型服务重定向到其他域名，为防止数据转发已阻止。请直接配置目标端点。',
  )
}

function rawHostname(input: string): string {
  const authority = input.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1] ?? ''
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1)
  if (hostPort.startsWith('[')) {
    const closingBracket = hostPort.indexOf(']')
    return closingBracket >= 0 ? hostPort.slice(0, closingBracket + 1) : hostPort
  }
  const portSeparator = hostPort.lastIndexOf(':')
  if (portSeparator >= 0 && /^\d*$/.test(hostPort.slice(portSeparator + 1))) {
    return hostPort.slice(0, portSeparator)
  }
  return hostPort
}

function isCanonicalLocalHostname(url: URL, input: string): boolean {
  const hostname = url.hostname.toLowerCase()
  const originalHostname = rawHostname(input).toLowerCase()
  return LOCAL_HOSTNAMES.has(hostname) && LOCAL_HOSTNAMES.has(originalHostname)
}

function parseModelEndpoint(input: string | URL): ParsedModelEndpoint {
  const value = input instanceof URL ? input.href : input
  if (typeof value !== 'string' || !value.trim() || /\s/.test(value.trim())) {
    throw invalidEndpoint()
  }

  const trimmed = value.trim()
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    throw invalidEndpoint()
  }
  if (trimmed.includes('\\')) throw invalidEndpoint()

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw invalidEndpoint()
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalidEndpoint()
  if (!url.hostname || url.hostname.endsWith('.') || url.username || url.password || url.hash) {
    throw invalidEndpoint()
  }
  if (url.origin === 'null') throw invalidEndpoint()

  const hostname = url.hostname.toLowerCase()
  const isLocal = isCanonicalLocalHostname(url, trimmed)
  return { url, hostname, isLocal }
}

function normalizedUrl(url: URL): string {
  const pathname = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${pathname === '/' ? '' : pathname}${url.search}`
}

function toModelEndpoint(parsed: ParsedModelEndpoint): ModelEndpoint {
  return {
    url: new URL(parsed.url.href),
    normalized: normalizedUrl(parsed.url),
    hostname: parsed.hostname,
    isLocal: parsed.isLocal,
  }
}

export function normalizeModelEndpoint(input: string): ModelEndpoint {
  const parsed = parseModelEndpoint(input)
  if (parsed.url.protocol === 'http:' && !parsed.isLocal) throw insecureEndpoint()
  return toModelEndpoint(parsed)
}

export function validateModelRedirect(
  current: string | URL,
  target: string | URL,
): ModelEndpoint {
  const currentEndpoint = parseModelEndpoint(current)
  const targetEndpoint = parseModelEndpoint(target)

  if (currentEndpoint.url.protocol === 'http:' && !currentEndpoint.isLocal) {
    throw insecureEndpoint()
  }
  if (targetEndpoint.url.protocol === 'http:') {
    if (!targetEndpoint.isLocal) {
      if (currentEndpoint.url.protocol === 'https:') throw insecureEndpoint()
      throw localHttpOnlyEndpoint()
    }
    if (currentEndpoint.url.protocol === 'https:') throw localHttpOnlyEndpoint()
  }
  const crossesOrigin = currentEndpoint.url.origin !== targetEndpoint.url.origin
  if (
    crossesOrigin &&
    (currentEndpoint.url.protocol === 'https:' || targetEndpoint.url.protocol === 'https:')
  ) {
    throw crossOriginRedirect()
  }
  return toModelEndpoint(targetEndpoint)
}

function requestUrl(input: FetchInput | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return 'url' in input && typeof input.url === 'string' ? input.url : String(input)
}

function requestMethod(input: FetchInput | URL, init?: RequestInit): string {
  if (typeof init?.method === 'string') return init.method.toUpperCase()
  if (typeof input !== 'string' && !(input instanceof URL) && 'method' in input && typeof input.method === 'string') {
    return input.method.toUpperCase()
  }
  return 'GET'
}

function shouldSwitchToGet(status: number, method: string): boolean {
  return (status === 301 || status === 302) && method === 'POST'
    || status === 303 && method !== 'GET' && method !== 'HEAD'
}

function withoutBodyHeaders(headers: RequestInit['headers'] | undefined): RequestInit['headers'] | undefined {
  if (!headers) return headers
  const next = new Headers(headers)
  next.delete('content-length')
  next.delete('content-type')
  return next
}

function validateFetchUrl(url: string): void {
  normalizeModelEndpoint(url)
}

function redirectValidationInput(location: string, currentUrl: string, resolved: URL): string | URL {
  if (!location || /[\s\\]/.test(location)) throw invalidEndpoint()
  if (!/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(location)) return resolved
  if (location.startsWith('//')) return `${new URL(currentUrl).protocol}${location}`
  return location
}

export interface SecureFetchOptions {
  maxRedirects?: number
  securityErrorMode?: 'throw' | 'response'
}

function securityErrorResponse(error: LlmEndpointSecurityError): Response {
  return new Response(JSON.stringify({
    error: {
      code: error.code,
      message: error.message,
      type: 'llm_endpoint_security',
    },
  }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  })
}

function handleSecurityError(error: unknown, mode: SecureFetchOptions['securityErrorMode']): Response {
  if (mode === 'response' && isLlmEndpointSecurityError(error)) {
    return securityErrorResponse(error)
  }
  throw error
}

export function createSecureFetch(
  baseFetch: typeof fetch = globalThis.fetch,
  options: SecureFetchOptions = {},
): typeof fetch {
  const maxRedirects = options.maxRedirects ?? 10
  const secureFetch = async (
    input: FetchInput | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    let currentInput: FetchInput | URL = input
    let currentInit = init
    let currentUrl = requestUrl(input)
    let method = requestMethod(input, init)
    const visited = new Set<string>()

    for (let redirectCount = 0; ; redirectCount += 1) {
      try {
        validateFetchUrl(currentUrl)
      } catch (error) {
        return handleSecurityError(error, options.securityErrorMode)
      }
      const response = await baseFetch(currentInput, {
        ...currentInit,
        redirect: 'manual',
      })
      if (!REDIRECT_STATUS_CODES.has(response.status)) return response

      const location = response.headers.get('location')
      if (!location) return response
      if (redirectCount >= maxRedirects) {
        return handleSecurityError(new LlmEndpointSecurityError(
          INVALID_LLM_BASE_URL,
          '模型服务重定向次数超过安全上限，请检查端点配置。',
        ), options.securityErrorMode)
      }

      let target: ModelEndpoint
      try {
        const targetUrl = new URL(location, currentUrl)
        target = validateModelRedirect(
          currentUrl,
          redirectValidationInput(location, currentUrl, targetUrl),
        )
        if (visited.has(target.normalized)) {
          throw new LlmEndpointSecurityError(
            INVALID_LLM_BASE_URL,
            '模型服务重定向形成循环，请检查端点配置。',
          )
        }
      } catch (error) {
        const securityError = isLlmEndpointSecurityError(error) ? error : invalidEndpoint()
        return handleSecurityError(securityError, options.securityErrorMode)
      }
      visited.add(target.normalized)

      await response.body?.cancel()
      currentUrl = target.url.href
      currentInput = currentUrl
      if (shouldSwitchToGet(response.status, method)) {
        method = 'GET'
        currentInit = {
          ...currentInit,
          method,
          body: undefined,
          headers: withoutBodyHeaders(currentInit?.headers),
        }
      }
    }
  }

  return secureFetch as typeof fetch
}

let installedSecureFetch: typeof fetch | undefined

export function installLlmFetchGuard(): () => void {
  const currentFetch = globalThis.fetch
  if (typeof currentFetch !== 'function' || currentFetch === installedSecureFetch) return () => {}
  const secureFetch = createSecureFetch(currentFetch, { securityErrorMode: 'response' })
  installedSecureFetch = secureFetch
  globalThis.fetch = secureFetch
  return () => {
    if (globalThis.fetch !== secureFetch) return
    globalThis.fetch = currentFetch
    if (installedSecureFetch === secureFetch) installedSecureFetch = undefined
  }
}

export function isLlmEndpointSecurityError(error: unknown): error is LlmEndpointSecurityError {
  return error instanceof LlmEndpointSecurityError
}

export function isLlmEndpointSecurityMessage(message: string | undefined): boolean {
  return message?.includes('模型端点无效。') === true
    || message?.includes('远程模型端点必须使用 HTTPS。') === true
    || message?.includes('HTTP 模型端点仅允许') === true
    || message?.includes('模型服务重定向') === true
}
