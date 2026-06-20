/**
 * 通用 CRUD Store 工厂函数
 *
 * 消除 Zustand Store 的样板代码，为列表型 CRUD 操作提供统一的状态管理。
 * 支持不同的 service 签名，通过泛型元组保留类型安全。
 *
 * 修复记录：
 * - 使用 BaseState 辅助类型 + set 回调形式消除 as any
 * - 分离 mutation 和 re-fetch 的错误处理
 * - 添加 fetch 请求序列号防止 stale data 覆盖
 * - 添加 mutation 计数器防止并发 re-fetch 竞争
 * - mutation 返回 ServiceResponse 供调用方使用
 * - err.message 防御性检查
 */
import { create, type StateCreator } from 'zustand'

// ============================================================
// 基础类型
// ============================================================

/** 统一的服务响应格式（与后端约定） */
export interface ServiceResponse<T = unknown> {
  success: boolean
  data?: T
  errors?: string[]
}

/**
 * 任何返回 Promise 的服务方法
 * 使用 any 而非 ServiceResponse 因为 window.electronAPI 的类型定义不完整
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceMethod = (...args: any[]) => Promise<any>

// ============================================================
// 配置类型
// ============================================================

/**
 * 工厂配置
 * @template TItem 列表项类型
 * @template TFetchArgs fetch 方法的参数元组类型
 * @template TMutations mutation 名到服务方法的映射类型
 */
export interface CrudConfig<
  TItem,
  TFetchArgs extends any[] = [],
  TMutations extends Record<string, ServiceMethod> = Record<string, never>,
> {
  /** 列表函数，调用方用闭包绑定 service.list 的签名差异 */
  list: (...args: TFetchArgs) => Promise<ServiceResponse<TItem[]>>
  /** mutation 名到服务方法的映射（工厂自动包裹 loading/error/refetch） */
  mutations?: TMutations
}

// ============================================================
// 返回的 Store 类型
// ============================================================

/** 将每个 mutation 的参数签名保留，返回值统一为 Promise<ServiceResponse> */
type WrapMutations<M extends Record<string, ServiceMethod>> = {
  [K in keyof M]: M[K] extends (...args: infer A) => any
    ? (...args: A) => Promise<ServiceResponse>
    : never
}

/** Store 基础状态（不含 mutation 方法，用于 set() 的类型推导） */
interface BaseState<TItem> {
  items: TItem[]
  loading: boolean
  error: string | null
}

/** Store 完整状态类型（基础 + 操作方法） */
export type CrudStoreState<
  TItem,
  TFetchArgs extends any[] = [],
  TMutations extends Record<string, ServiceMethod> = Record<string, never>,
> = BaseState<TItem> & {
  fetch: (...args: TFetchArgs) => Promise<void>
  refetch: () => Promise<void>
} & WrapMutations<TMutations>

// ============================================================
// 辅助函数
// ============================================================

/** 安全提取错误消息 */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err)
    return String((err as { message: unknown }).message)
  return '未知错误'
}

/** 从 ServiceResponse 提取错误消息 */
function extractResponseError(res: ServiceResponse, fallback: string): string {
  if (res.errors && res.errors.length > 0) return res.errors[0]
  return fallback
}

// ============================================================
// 工厂实现
// ============================================================

/**
 * 创建通用 CRUD Store
 *
 * @param config 工厂配置（list 函数 + 可选 mutations）
 * @returns Zustand Store Hook
 */
export function createCrudStore<
  TItem,
  TFetchArgs extends any[] = [],
  TMutations extends Record<string, ServiceMethod> = Record<string, never>,
>(config: CrudConfig<TItem, TFetchArgs, TMutations>) {
  // 闭包存储最近一次 fetch 的参数，用于 refetch
  let _lastFetchArgs: TFetchArgs | null = null
  // fetch 请求序列号，防止 stale data 覆盖
  let _fetchSeq = 0
  // mutation 计数器，防止并发 re-fetch 竞争
  let _mutationCount = 0

  const storeCreator: StateCreator<CrudStoreState<TItem, TFetchArgs, TMutations>> = (
    set,
    _get,
  ) => {
    // ---- 内部辅助：安全地更新基础状态 ----
    const setBase = (partial: Partial<BaseState<TItem>>) => {
      set((state) => ({ ...state, ...partial }))
    }

    // ---- 内部辅助：处理列表响应 ----
    const applyListResponse = (res: ServiceResponse<TItem[]>, seq: number) => {
      // 只有最新请求的响应才写入状态
      if (seq !== _fetchSeq) return
      if (res.success) {
        setBase({ items: res.data ?? [], loading: false, error: null })
      } else {
        setBase({ error: extractResponseError(res, '未知错误'), loading: false })
      }
    }

    // ---- fetch：加载列表 ----
    const fetch = async (...args: TFetchArgs) => {
      const seq = ++_fetchSeq
      // 清除旧数据，避免切换角色时显示旧数据
      setBase({ items: [], loading: true, error: null })
      _lastFetchArgs = args
      try {
        applyListResponse(await config.list(...args), seq)
      } catch (err: unknown) {
        if (seq === _fetchSeq) {
          setBase({ error: extractErrorMessage(err), loading: false })
        }
      }
    }

    // ---- refetch：使用上次参数重新加载 ----
    const refetch = async () => {
      if (_lastFetchArgs) {
        await fetch(..._lastFetchArgs)
      }
    }

    // ---- 包裹每个 mutation ----
    const wrappedMutations = {} as WrapMutations<TMutations>

    if (config.mutations) {
      for (const [name, serviceFn] of Object.entries(config.mutations)) {
        ;(wrappedMutations as Record<string, unknown>)[name] = async (
          ...args: unknown[]
        ): Promise<ServiceResponse> => {
          _mutationCount++
          setBase({ loading: true, error: null })
          try {
            const res = await serviceFn(...args)
            if (res.success) {
              // mutation 成功后自动 re-fetch
              if (_lastFetchArgs) {
                try {
                  const listRes = await config.list(..._lastFetchArgs)
                  // 只有最后一个 mutation 完成后才更新列表
                  if (_mutationCount <= 1) {
                    applyListResponse(listRes, _fetchSeq)
                  }
                } catch {
                  // re-fetch 失败不覆盖 mutation 成功状态
                  // 列表数据可能陈旧，但 mutation 已成功
                  setBase({ loading: false })
                }
              } else {
                // _lastFetchArgs 为 null（fetch 从未调用），只清除 loading
                setBase({ loading: false })
              }
            } else {
              setBase({
                error: extractResponseError(res, '操作失败'),
                loading: false,
              })
            }
            return res
          } catch (err: unknown) {
            setBase({ error: extractErrorMessage(err), loading: false })
            return { success: false, errors: [extractErrorMessage(err)] }
          } finally {
            _mutationCount--
          }
        }
      }
    }

    return {
      items: [],
      loading: false,
      error: null,
      fetch,
      refetch,
      ...wrappedMutations,
    } as CrudStoreState<TItem, TFetchArgs, TMutations>
  }

  return create<CrudStoreState<TItem, TFetchArgs, TMutations>>()(storeCreator)
}
