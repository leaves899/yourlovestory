import { Alert, AlertIcon, Box, Code, Text } from '@chakra-ui/react'
import {
  isLlmEndpointSecurityError,
  normalizeModelEndpoint,
} from '../../shared/security/urlSecurity'

export type LlmEndpointSecurityStatus = 'secure' | 'local' | 'blocked'

export interface LlmEndpointSecurityState {
  valid: boolean
  status: LlmEndpointSecurityStatus
  hostname: string | null
  message: string
}

export function inspectLlmEndpoint(baseUrl: string): LlmEndpointSecurityState {
  try {
    const endpoint = normalizeModelEndpoint(baseUrl)
    const local = endpoint.url.protocol === 'http:' && endpoint.isLocal
    return {
      valid: true,
      status: local ? 'local' : 'secure',
      hostname: endpoint.hostname,
      message: local ? '本地 HTTP，仅用于本地开发' : 'HTTPS，安全的远程端点',
    }
  } catch (error) {
    return {
      valid: false,
      status: 'blocked',
      hostname: null,
      message: isLlmEndpointSecurityError(error)
        ? error.message
        : '模型端点无效，请检查地址和协议。',
    }
  }
}

export function LlmEndpointSecurityNotice({ baseUrl }: { baseUrl: string }) {
  const state = inspectLlmEndpoint(baseUrl)
  const alertStatus = state.status === 'secure' ? 'success' : state.status === 'local' ? 'info' : 'error'

  return (
    <Alert status={alertStatus} alignItems="flex-start" borderRadius="8px">
      <AlertIcon mt="3px" />
      <Box>
        {state.hostname && (
          <Text fontSize="sm">
            你的数据将发送至：<Code>{state.hostname}</Code>
          </Text>
        )}
        <Text fontSize="sm" mt={state.hostname ? 1 : 0}>{state.message}</Text>
      </Box>
    </Alert>
  )
}
