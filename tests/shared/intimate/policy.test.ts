import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  assertIntimateContentAllowed,
  getIntimatePolicy,
  IntimateContentDisabledError,
  stripIntimateContent,
} from '@/shared/intimate/policy'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-intimate-'))
  fs.mkdirSync(path.join(tmpRoot, 'crushes', 'demo'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('intimate policy', () => {
  test('defaults to disabled when config is absent', () => {
    expect(getIntimatePolicy(tmpRoot, 'demo')).toEqual({ enabled: false })
  })

  test('rejects intimate generation fields while disabled', () => {
    const policy = getIntimatePolicy(tmpRoot, 'demo')
    expect(() =>
      assertIntimateContentAllowed(policy, { sexCount: 1 })
    ).toThrow(IntimateContentDisabledError)
    expect(() =>
      assertIntimateContentAllowed(policy, { sexDetails: 'details' })
    ).toThrow(IntimateContentDisabledError)
    expect(stripIntimateContent(policy, { sexCount: 1, sexDetails: 'details' })).toEqual({
      sexCount: undefined,
      sexDetails: undefined,
    })
  })

  test('allows intimate generation fields only after explicit enablement', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'crushes', 'demo', '.intimate_config'),
      'intimate=true\n',
      'utf-8'
    )
    const policy = getIntimatePolicy(tmpRoot, 'demo')
    expect(policy.enabled).toBe(true)
    expect(() =>
      assertIntimateContentAllowed(policy, { sexCount: 1, sexDetails: 'details' })
    ).not.toThrow()
  })
})
