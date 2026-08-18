import type { ContextCompileTrace } from './models'

export class ContextCompilerError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ContextCompilerError'
  }
}

export class ContextBudgetExceededError extends ContextCompilerError {
  public readonly requiredTokens: number
  public readonly availableTokens: number
  public readonly requiredItemIds: readonly string[]
  /** Serializable failure trace for checkpoint persistence (no final_prompt by default). */
  public readonly failureTrace: ContextCompileTrace

  public constructor(
    message: string,
    details: {
      requiredTokens: number
      availableTokens: number
      requiredItemIds: readonly string[]
      failureTrace: ContextCompileTrace
    },
  ) {
    super(message)
    this.name = 'ContextBudgetExceededError'
    this.requiredTokens = details.requiredTokens
    this.availableTokens = details.availableTokens
    this.requiredItemIds = details.requiredItemIds
    this.failureTrace = details.failureTrace
  }
}
