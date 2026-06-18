/**
 * 共享的 Python 子进程调用工具。
 *
 * 这是全项目唯一一处 spawn/execFileSync 实现，供主进程 IPC（src/main/ipc.ts）、
 * Pi Agent 工具（src/agent/tools/*.ts）与 CLI 契约测试（tests/cli/runner.ts）复用，
 * 消除此前三处重复的 spawn 逻辑。
 *
 * 设计要点：
 * - 统一使用 `python -m <modulePath>` 调用（而非直接传 .py 路径）。
 *   原因：src/scripts/day/service.py、src/scripts/fragment/manager.py 等
 *   模块含顶层相对导入（from .xxx import），直接 `python path/to/file.py`
 *   会在模块加载阶段抛 ImportError；-m 方式下相对导入才能正确解析。
 * - 统一连字符 flag（--env-tags 而非 --env_tags）。argparse 自动把 `-` 映射为 `_`，
 *   两种写法的 dest 等价，Python 端读取代码不受影响。
 * - exitCode≠0 时不 reject：Python 业务失败约定为 exit 1 + stdout 返回
 *   {success:false,...}，进程级错误（spawn ENOENT、被 signal 中止）才 reject。
 * - 强制 utf-8 编码，避免 Windows 下中文乱码。
 *
 * 注意：此模块不依赖 electron 的 app 模块，运行时 cwd 由调用方传入。
 * 打包态（asar 内 + 无系统 python）下桥接不可用，属过渡期产物，
 * 详见 docs/adr/0004-python-ts-migration.md。
 */
import { spawn, execFileSync } from 'child_process'

export interface RunPythonOptions {
  /** 透传给 spawn 的 AbortSignal，用于取消运行中的子进程（agent 工具用） */
  signal?: AbortSignal
  /** 超时毫秒，超时则 kill 子进程；默认无超时 */
  timeoutMs?: number
  /** 子进程工作目录，默认 process.cwd()；ipc 传 app.getAppPath() */
  cwd?: string
  /** 环境变量，默认合并 process.env 并强制 utf-8 */
  env?: NodeJS.ProcessEnv
}

export interface PythonResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** 默认环境：合并父进程环境并强制 Python 输出 utf-8。 */
function buildEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    ...(extra ?? {}),
  }
}

/**
 * 将参数对象转换为 --key value 参数数组。
 * - key 中的下划线转为连字符（env_tags → --env-tags），与 Python argparse 惯例一致。
 * - 数组值 JSON.stringify（用于 env_tags / behavior_tags 等）。
 * - undefined / null 值跳过。
 * - 其余值 String(value)。
 */
export function buildArgs(params: Record<string, any>): string[] {
  const args: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    const flagName = `--${key.replace(/_/g, '-')}`
    if (Array.isArray(value)) {
      args.push(flagName, JSON.stringify(value))
    } else {
      args.push(flagName, String(value))
    }
  }
  return args
}

/**
 * 异步执行 `python -m <modulePath> ...args`。
 *
 * 永远 resolve（不因 exitCode≠0 reject）：业务失败由调用方读取 exitCode / 解析 stdout 判断。
 * 仅当 spawn 本身失败（如 python 不在 PATH）或被 signal 中止时 reject。
 */
export function runPython(
  modulePath: string,
  args: string[],
  opts?: RunPythonOptions
): Promise<PythonResult> {
  const cwd = opts?.cwd ?? process.cwd()
  const env = buildEnv(opts?.env)
  const timeout = opts?.timeoutMs

  return new Promise<PythonResult>((resolve, reject) => {
    const child = spawn('python', ['-m', modulePath, ...args], {
      cwd,
      shell: false,
      env,
      signal: opts?.signal,
      ...(timeout ? { timeout } : {}),
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })
    child.on('error', reject)
  })
}

/**
 * 同步执行 `python -m <modulePath> ...args`（execFileSync）。
 * 供 jest 契约测试在同步上下文使用。默认超时 15000ms。
 */
export function runPythonSync(
  modulePath: string,
  args: string[],
  opts?: RunPythonOptions
): PythonResult {
  const cwd = opts?.cwd ?? process.cwd()
  const env = buildEnv(opts?.env)
  const timeoutMs = opts?.timeoutMs ?? 15000

  try {
    const stdout = execFileSync('python', ['-m', modulePath, ...args], {
      cwd,
      shell: false,
      encoding: 'utf-8',
      timeout: timeoutMs,
      env,
    })
    return { stdout, stderr: '', exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
      exitCode: err.status ?? 1,
    }
  }
}

/**
 * 解析 Python 脚本的 JSON 输出。
 *
 * `python -m` 可能在 stdout 前输出 RuntimeWarning 行，需定位首个 `{` 后再 JSON.parse。
 * 若 stdout 中不含 `{`，抛出带原始输出的清晰错误（而非吞掉后报莫名其妙的 parse 错）。
 */
export function parsePythonJSON<T = any>(stdout: string): T {
  let jsonStr = stdout.trim()
  const jsonStart = jsonStr.indexOf('{')
  if (jsonStart === -1) {
    throw new Error(`Python 输出非 JSON: ${jsonStr || '(空输出)'}`)
  }
  if (jsonStart > 0) {
    jsonStr = jsonStr.slice(jsonStart)
  }
  return JSON.parse(jsonStr)
}
