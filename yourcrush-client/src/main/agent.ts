import { Agent, type AgentOptions, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { loadCrushContext } from "./context-cache";
import { pythonBridge } from "./python-bridge";
import { loadConfig, type AgentConfig } from "./config";
import { streamSimple, type Model, type Api } from "@earendil-works/pi-ai";

// 创建工具（注入 crushSlug）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createTools(crushSlug: string): AgentTool<any>[] {
  const recordFragmentTool: AgentTool = {
    name: "record_fragment",
    label: "记录碎片",
    description: "记录用户输入的碎片日记",
    parameters: Type.Object({
      content: Type.String({ minLength: 1, maxLength: 10000 }),
      origin: Type.Union([
        Type.Literal("user"),
        Type.Literal("crush"),
        Type.Literal("ambient")
      ]),
      mood: Type.Optional(Type.Union([
        Type.Literal("positive"),
        Type.Literal("negative"),
        Type.Literal("neutral"),
        Type.Literal("mixed")
      ])),
      env_tags: Type.Optional(Type.Array(Type.String())),
      behavior_tags: Type.Optional(Type.Array(Type.String())),
    }),
    execute: async (_id: string, params: any) => {
      const result = await pythonBridge.call("record", crushSlug, JSON.stringify(params));
      return { content: [{ type: "text", text: result }], details: undefined };
    },
  };

  const getFragmentsTool: AgentTool = {
    name: "get_fragments",
    label: "获取碎片",
    description: "获取指定日期的碎片列表",
    parameters: Type.Object({
      date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    }),
    execute: async (_id: string, params: any) => {
      const result = await pythonBridge.call("list", crushSlug, params.date);
      return { content: [{ type: "text", text: result }], details: undefined };
    },
  };

  const generateNarrativeTool: AgentTool = {
    name: "generate_narrative",
    label: "生成叙事",
    description: "基于碎片生成完整叙事",
    parameters: Type.Object({
      date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    }),
    execute: async (_id: string, params: any) => {
      const result = await pythonBridge.call("integrate", crushSlug, params.date);
      return { content: [{ type: "text", text: result }], details: undefined };
    },
  };

  return [recordFragmentTool, getFragmentsTool, generateNarrativeTool];
}

// 根据配置创建 Model 对象
function createModelFromConfig(config: AgentConfig): Model<Api> {
  const modelId = config.model;
  const provider = config.provider;

  // 根据 provider 推断 API 类型
  let api: Api = "openai-completions";
  if (provider === "anthropic") {
    api = "anthropic-messages";
  } else if (provider === "google" || provider === "google-vertex") {
    api = "google-generative-ai";
  }

  // 获取 baseUrl
  const baseUrl = config.baseUrl || getDefaultBaseUrl(provider);

  return {
    id: modelId,
    name: modelId,
    api,
    provider,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: config.maxTokens || 4096,
  };
}

// 获取默认 baseUrl
function getDefaultBaseUrl(provider: string): string {
  const baseUrls: Record<string, string> = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "google": "https://generativelanguage.googleapis.com",
    "openrouter": "https://openrouter.ai/api/v1",
  };
  return baseUrls[provider] || "";
}

export async function createCrushAgent(crushSlug: string): Promise<Agent> {
  const [systemPrompt, config] = await Promise.all([
    loadCrushContext(crushSlug),
    loadConfig(),
  ]);

  // 创建 Model 对象
  const model = createModelFromConfig(config);

  // 创建 streamFn，注入 apiKey 和其他配置
  const customStreamFn = async (...args: Parameters<typeof streamSimple>) => {
    const [modelArg, context, options] = args;
    const mergedOptions = {
      ...options,
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };
    return streamSimple(modelArg, context, mergedOptions);
  };

  // 创建工具（注入 crushSlug）
  const tools = createTools(crushSlug);

  const options: AgentOptions = {
    initialState: {
      systemPrompt,
      model,
      tools,
    },
    streamFn: customStreamFn,
  };

  return new Agent(options);
}
