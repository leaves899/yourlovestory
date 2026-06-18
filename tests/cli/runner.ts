/**
 * CLI 契约测试共享辅助模块
 *
 * 复用 src/shared/pythonRunner.ts（全项目唯一 spawn 实现），
 * 镜像 ipc.ts 的 buildArgs 逻辑，使用 -m 模块方式调用 Python 脚本，
 * 验证 JSON 输出格式。
 */
import {
  buildArgs,
  parsePythonJSON,
  runPythonSync,
  type PythonResult,
} from '@/shared/pythonRunner'
import { createCrush, deleteCrush } from '@/shared/crush/crushStore'

export { buildArgs }
export type { PythonResult }

/**
 * 调用 Python 脚本并返回结果。
 *
 * 注意：签名是 (modulePath, params) —— params 是原始参数对象，
 * 内部经 buildArgs 转为 --key value 数组后调用 runPythonSync。
 * （不能直接 = runPythonSync，因为后者第二个参数期望的是 args 数组而非 params 对象。）
 */
export function runPythonScript(
  modulePath: string,
  params: Record<string, any>
): PythonResult {
  return runPythonSync(modulePath, buildArgs(params))
}

/**
 * 解析 Python 脚本的 JSON 输出。
 * 跳过可能的 RuntimeWarning 前缀行（委托给 parsePythonJSON）。
 */
export function parseResult(output: PythonResult): {
  success: boolean
  data?: any
  errors?: string[]
} {
  return parsePythonJSON(output.stdout)
}

/**
 * 生成唯一测试 slug，避免测试间冲突。
 */
export function testSlug(prefix: string = 'smoke_test'): string {
  return `${prefix}_${Date.now()}`
}

/** Python 模块路径常量（使用 -m 模块方式）。
 *  crush 已迁移到 TS crushStore，不再在此列；用 createTestCrush/deleteTestCrush 准备角色。 */
export const MODULES = {
  FRAGMENT: 'src.scripts.fragment.manager',
  DAY: 'src.scripts.day.service',
} as const

/**
 * 创建测试角色（走 TS crushStore，不再调 Python）。
 * fragment/day 契约测试的 beforeEach 用它准备角色目录。
 */
export function createTestCrush(
  projectRoot: string,
  slug: string,
  name = 'ContractTest',
  nickname = 'CT'
): void {
  const result = createCrush(projectRoot, { name, nickname, slug })
  if (!result.success) {
    throw new Error(`createTestCrush failed for ${slug}: ${JSON.stringify(result.errors)}`)
  }
}

/** 删除测试角色（走 TS crushStore）。 */
export function deleteTestCrush(projectRoot: string, slug: string): void {
  deleteCrush(projectRoot, slug)
}
