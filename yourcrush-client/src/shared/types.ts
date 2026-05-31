import { Type, Static, Optional } from "@sinclair/typebox";

// 碎片输入 Schema（运行时校验）
export const FragmentInputSchema = Type.Object({
  content: Type.String({ minLength: 1, maxLength: 10000 }),
  origin: Type.Union([
    Type.Literal("user"),
    Type.Literal("crush"),
    Type.Literal("ambient")
  ]),
  mood: Optional(Type.Union([
    Type.Literal("positive"),
    Type.Literal("negative"),
    Type.Literal("neutral"),
    Type.Literal("mixed")
  ])),
  env_tags: Optional(Type.Array(Type.String())),
  behavior_tags: Optional(Type.Array(Type.String())),
});

export type FragmentInput = Static<typeof FragmentInputSchema>;

// 碎片数据结构
export interface Fragment extends FragmentInput {
  id: string;
  created_at: string;
}

// 叙事生成请求
export interface NarrativeRequest {
  date: string; // YYYY-MM-DD 格式
}

// Agent 配置 Schema（运行时校验）
export const AgentConfigSchema = Type.Object({
  provider: Type.String({ minLength: 1 }),
  model: Type.String({ minLength: 1 }),
  apiKey: Type.String(),
  baseUrl: Type.String(),
  temperature: Type.Number({ minimum: 0, maximum: 2 }),
  maxTokens: Type.Integer({ minimum: 1, maximum: 100000 }),
});

export type AgentConfigInput = Static<typeof AgentConfigSchema>;

// Agent 配置类型（TypeBox 推导）
export type AgentConfig = AgentConfigInput;

// 默认配置
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: '',
  baseUrl: '',
  temperature: 0.7,
  maxTokens: 4096,
};