import type { JsonValue } from '../novelProject'
import { normalizeModelEndpoint } from './urlSecurity'

const FORBIDDEN_CONFIGURATION_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
])

const CREDENTIAL_KEY_SUFFIXES = [
  'authorization',
  'apikey',
  'token',
  'secret',
  'password',
  'privatekey',
] as const

export interface PortableConfigurationLimits {
  maxDepth: number
  maxArrayLength: number
  maxObjectProperties: number
  maxKeyLength: number
  maxStringLength: number
  maxNodes: number
}

export const DEFAULT_PORTABLE_CONFIGURATION_LIMITS: PortableConfigurationLimits = {
  maxDepth: 6,
  maxArrayLength: 10_000,
  maxObjectProperties: 2_000,
  maxKeyLength: 128,
  maxStringLength: 2_000_000,
  maxNodes: 50_000,
}

export interface PortableConfigSanitizationResult {
  value: JsonValue
  removedPlaintextCredentials: number
  removedCredentialReferences: number
  removedLocalPaths: number
}

export interface PortableConfigInspection {
  safe: boolean
  plaintextCredentials: number
  credentialReferences: number
  localPaths: number
}

export class PortableConfigurationValidationError extends Error {
  public constructor() {
    super('Portable configuration is invalid')
    this.name = 'PortableConfigurationValidationError'
  }
}

export function normalizeConfigurationKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

export function isPlaintextCredentialKey(key: string): boolean {
  const normalized = normalizeConfigurationKey(key)
  return CREDENTIAL_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

export function isCredentialReferenceKey(key: string): boolean {
  return normalizeConfigurationKey(key).endsWith('credentialid')
}

export function isForbiddenConfigurationKey(key: string): boolean {
  return FORBIDDEN_CONFIGURATION_KEYS.has(key)
}

export function isLocalConfigurationPath(value: string): boolean {
  return (
    /^[a-z]:/i.test(value)
    || /^\\\\/.test(value)
    || value.startsWith('/')
    || /^file:/i.test(value)
  )
}

function safeObject(): Record<string, JsonValue> {
  return Object.create(null) as Record<string, JsonValue>
}

function defineDataProperty(
  target: Record<string, JsonValue>,
  key: string,
  value: JsonValue,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })
}

type WalkMode = 'export' | 'inspect'

interface WalkCounters {
  plaintextCredentials: number
  credentialReferences: number
  localPaths: number
}

interface WalkTask {
  value: JsonValue
  depth: number
  endpoint: boolean
  assign?: (value: JsonValue) => void
}

function walkPortableConfiguration(
  value: JsonValue,
  mode: WalkMode,
  limits: PortableConfigurationLimits,
): { value: JsonValue; counters: WalkCounters } {
  const counters: WalkCounters = {
    plaintextCredentials: 0,
    credentialReferences: 0,
    localPaths: 0,
  }
  let result: JsonValue = null
  let visitedNodes = 1
  const tasks: WalkTask[] = [{
    value,
    depth: 0,
    endpoint: false,
    assign: (next) => { result = next },
  }]

  const enqueue = (task: WalkTask): void => {
    visitedNodes += 1
    if (visitedNodes > limits.maxNodes || task.depth > limits.maxDepth) {
      throw new PortableConfigurationValidationError()
    }
    tasks.push(task)
  }

  while (tasks.length > 0) {
    const task = tasks.pop()
    if (!task) break
    const current = task.value

    if (typeof current === 'string') {
      if (current.length > limits.maxStringLength) {
        throw new PortableConfigurationValidationError()
      }
      if (task.endpoint) {
        let normalized: string
        try {
          normalized = normalizeModelEndpoint(current).normalized
        } catch {
          throw new PortableConfigurationValidationError()
        }
        if (mode === 'inspect' && normalized !== current) {
          throw new PortableConfigurationValidationError()
        }
        task.assign?.(normalized)
      } else if (isLocalConfigurationPath(current)) {
        counters.localPaths += 1
        task.assign?.(mode === 'export' ? null : current)
      } else {
        task.assign?.(current)
      }
      continue
    }
    if (
      current === null
      || typeof current === 'boolean'
      || (typeof current === 'number' && Number.isFinite(current) && Math.abs(current) <= 1e15)
    ) {
      if (task.endpoint) throw new PortableConfigurationValidationError()
      task.assign?.(current)
      continue
    }
    if (typeof current !== 'object') throw new PortableConfigurationValidationError()

    if (Array.isArray(current)) {
      if (current.length > limits.maxArrayLength) {
        throw new PortableConfigurationValidationError()
      }
      const target: JsonValue[] = new Array(current.length)
      task.assign?.(target)
      for (let index = current.length - 1; index >= 0; index -= 1) {
        enqueue({
          value: current[index],
          depth: task.depth + 1,
          endpoint: false,
          assign: mode === 'export' ? (next) => { target[index] = next } : undefined,
        })
      }
      continue
    }

    const entries = Object.entries(current)
    if (entries.length > limits.maxObjectProperties) {
      throw new PortableConfigurationValidationError()
    }
    const target = safeObject()
    task.assign?.(target)
    const childTasks: WalkTask[] = []
    for (const [key, entry] of entries) {
      if (
        key.length < 1
        || key.length > limits.maxKeyLength
        || isForbiddenConfigurationKey(key)
      ) {
        throw new PortableConfigurationValidationError()
      }
      if (isCredentialReferenceKey(key)) {
        counters.credentialReferences += 1
        continue
      }
      if (isPlaintextCredentialKey(key)) {
        counters.plaintextCredentials += 1
        continue
      }
      if (mode === 'export') defineDataProperty(target, key, null)
      const normalizedKey = normalizeConfigurationKey(key)
      childTasks.push({
        value: entry,
        depth: task.depth + 1,
        endpoint: normalizedKey === 'baseurl' || normalizedKey === 'llmbaseurl',
        assign: mode === 'export'
          ? (next) => { defineDataProperty(target, key, next) }
          : undefined,
      })
    }
    for (let index = childTasks.length - 1; index >= 0; index -= 1) {
      enqueue(childTasks[index])
    }
  }

  return { value: result, counters }
}

export function sanitizePortableConfiguration(
  value: JsonValue,
  limits: PortableConfigurationLimits = DEFAULT_PORTABLE_CONFIGURATION_LIMITS,
): PortableConfigSanitizationResult {
  const walked = walkPortableConfiguration(value, 'export', limits)
  return {
    value: walked.value,
    removedPlaintextCredentials: walked.counters.plaintextCredentials,
    removedCredentialReferences: walked.counters.credentialReferences,
    removedLocalPaths: walked.counters.localPaths,
  }
}

export function inspectPortableConfiguration(
  value: JsonValue,
  limits: PortableConfigurationLimits = DEFAULT_PORTABLE_CONFIGURATION_LIMITS,
): PortableConfigInspection {
  const walked = walkPortableConfiguration(value, 'inspect', limits)
  const {
    plaintextCredentials,
    credentialReferences,
    localPaths,
  } = walked.counters
  return {
    safe: plaintextCredentials === 0 && credentialReferences === 0 && localPaths === 0,
    plaintextCredentials,
    credentialReferences,
    localPaths,
  }
}
