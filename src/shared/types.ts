/**
 * MetaCode  共享类型定义
 * 用于主进程和渲染进程共享的类型
 */

// 模型配置
export type ModelType = "official" | "third-party" | "local";

export type ConnectionStatus = "unknown" | "testing" | "connected" | "error";

/** 提供商预设 */
export interface ProviderPreset {
  label: string;
  type: ModelType;
  baseUrl: string;
  models: string[];
  apiKeyPattern?: string;
}

export interface ProxyConfig {
  protocol: "http" | "https" | "socks5";
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/** 网关配置 - 管理一个提供商的连接与多模型分配 */
export interface GatewayProfile {
  id: string;
  /** 配置显示名称 */
  name: string;
  /** 提供商类型 */
  type: ModelType;
  /** API 基础 URL */
  baseUrl: string;
  /** API Key */
  apiKey?: string;
  /** 提供商模式 */
  provider?: "custom" | "deepseek";
  /** API 格式，auto 表示根据 type 自动推断 */
  apiFormat?: "anthropic" | "openai";
  /** 代理配置 */
  proxy?: ProxyConfig;

  // ========== 5 个模型槽位 ==========
  /** 默认主模型 */
  defaultModel: string;
  /** 专家模型 */
  expertModel: string;
  /** 小模型 */
  smallModel: string;
  /** 分析模型 */
  analysisModel: string;
  /** 图片处理模型 */
  imageModel: string;

  /** 从网关拉取到的可用模型列表 */
  availableModels: string[];

  /** 连接状态 */
  connectionStatus?: ConnectionStatus;
  /** 最后测试时间 */
  lastTestedAt?: string;

  /** 是否启用 */
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  type: ModelType;
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  maxTokens?: number;
  temperature?: number;
  /** API 格式，默认根据 type 推断 */
  apiFormat?: "anthropic" | "openai";
  /** 分组标签 */
  group?: string;
  /** 代理配置 */
  proxy?: ProxyConfig;
  /** 连接状态 */
  connectionStatus?: ConnectionStatus;
  /** 最后测试时间 */
  lastTestedAt?: string;
  /** 是否启用 */
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** 预设提供商列表 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: "Anthropic Claude 官方",
    type: "official",
    baseUrl: "https://api.anthropic.com",
    models: [
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240620",
    ],
    apiKeyPattern: "sk-ant-",
  },
  {
    label: "OpenAI",
    type: "third-party",
    baseUrl: "https://api.openai.com/v1",
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-3.5-turbo",
      "o1",
      "o3-mini",
    ],
    apiKeyPattern: "sk-",
  },
  {
    label: "Google Gemini",
    type: "third-party",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: [
      "gemini-2.0-flash",
      "gemini-2.0-pro",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
    apiKeyPattern: "AIza",
  },
  {
    label: "Ollama 本地模型",
    type: "local",
    baseUrl: "http://localhost:11434",
    models: [
      "llama3",
      "llama3:70b",
      "qwen2",
      "qwen2:72b",
      "mistral",
      "codellama",
      "deepseek-coder",
    ],
  },
];

// 会话数据
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  toolCalls?: ToolCallResult[];
  relatedFiles?: string[];
}

export interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  status: "success" | "error";
  error?: string;
}

export interface SessionData {
  id: string;
  title: string;
  projectPath?: string;
  messages: ChatMessage[];
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

// 文件系统
export interface FileSystemEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  children?: FileSystemEntry[];
}

// 用量统计
export interface DailyUsage {
  date: string;
  tokens: number;
  requests: number;
}

export interface UsageStats {
  totalTokens: number;
  totalRequests: number;
  dailyStats: DailyUsage[];
}

// DOM 标注
export interface ElementAnnotation {
  tagName: string;
  id: string | null;
  className: string | null;
  selector: string;
  textContent: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  styles: Record<string, string>;
  attributes: Array<{ name: string; value: string }>;
  screenshot?: string;
}

// 诊断
export type ExecutionStatus =
  | "idle"
  | "running"
  | "success"
  | "error"
  | "warning";

export interface DiagnosticInfo {
  status: ExecutionStatus;
  message?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

// Agent 响应
export interface AgentResponse {
  content: string;
  toolCalls?: ToolCallResult[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
