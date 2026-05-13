/**
 * MetaCode  全局类型定义
 */

// ========================
// 模型配置类型
// ========================

/** 模型类型枚举 */
type ModelType = "official" | "third-party" | "local";

/** API 提供商模式 */
type ProviderMode = "custom" | "deepseek";

/** 连接状态 */
type ConnectionStatus = "unknown" | "testing" | "connected" | "error";

/** 代理配置 */
interface ProxyConfig {
  protocol: "http" | "https" | "socks5";
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/** 网关配置 - 管理一个提供商的连接与多模型分配 */
interface GatewayProfile {
  id: string;
  name: string;
  type: ModelType;
  baseUrl: string;
  apiKey?: string;
  provider?: ProviderMode;
  proxy?: ProxyConfig;
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
  connectionStatus?: ConnectionStatus;
  lastTestedAt?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** 模型配置接口 */
interface ModelConfig {
  /** 模型唯一标识 */
  id: string;
  /** 模型显示名称 */
  name: string;
  /** 模型类型 */
  type: ModelType;
  /** API Key（官方和第三方模型需要） */
  apiKey?: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 模型名称 */
  modelName?: string;
  /** 最大 Token 数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
  /** 提供商模式（自动配置 API 端点） */
  provider?: ProviderMode;
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
  /** 创建时间 */
  createdAt?: string;
  /** 更新时间 */
  updatedAt?: string;
}

// ========================
// 会话数据类型
// ========================

/** 聊天消息角色 */
type MessageRole = "user" | "assistant" | "system" | "tool";

/** 聊天消息 */
interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  /** 工具调用结果 */
  toolCalls?: ToolCallResult[];
  /** 关联的文件 */
  relatedFiles?: string[];
}

/** 工具调用结果 */
interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  status: "success" | "error";
  error?: string;
}

/** 会话数据 */
interface SessionData {
  /** 会话唯一标识 */
  id: string;
  /** 会话标题 */
  title: string;
  /** 关联的项目路径 */
  projectPath?: string;
  /** 会话消息列表 */
  messages: ChatMessage[];
  /** 是否已归档 */
  archived?: boolean;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

// ========================
// 文件系统类型
// ========================

/** 文件系统条目 */
interface FileSystemEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  children?: FileSystemEntry[];
}

// ========================
// 用量统计类型
// ========================

/** 每日用量统计 */
interface DailyUsage {
  date: string;
  tokens: number;
  requests: number;
}

/** 用量统计 */
interface UsageStats {
  totalTokens: number;
  totalRequests: number;
  dailyStats: DailyUsage[];
}

/** 标注上下文（传递给 AI 的底层数据） */
interface AnnotationContext {
  f: string;   // 文件名
  fp?: string; // 完整本地文件路径
  sel: string; // 元素选择器缩写
  tag: string; // 标签名
  s: Record<string, string>; // 有效 CSS 样式
  page?: string; // 页面 URL
  note: string;  // 用户备注（作为指令发送给 AI）
}

/** 元素标注信息 */
interface ElementAnnotation {
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
  /** 截图（Base64） */
  screenshot?: string;
  /** 页面 URL */
  pageUrl?: string;
  /** 页面标题 */
  pageTitle?: string;
  /** 从 React/Vue fiber 解析到的源码位置信息 */
  sourceFile?: string;
  sourceLine?: number;
  sourceColumn?: number;
  /** 组件栈 */
  componentStack?: string[];
}

// ========================
// 诊断类型
// ========================

/** 执行状态 */
type ExecutionStatus = "idle" | "running" | "success" | "error" | "warning";

/** 诊断信息 */
interface DiagnosticInfo {
  status: ExecutionStatus;
  message?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

/** 标注任务 */
interface AnnotationTask {
  id: string;
  text: string;
  elementInfo: ElementAnnotation;
  /** 创建时间 */
  createdAt?: string;
  /** 本地文件路径（从渲染进程补充） */
  filePath?: string;
}

// ========================
// Electron API 类型声明
// ========================

/** Electron API 接口 */
interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
  fs: {
    readFile: (
      filePath: string,
    ) => Promise<{ success: boolean; data?: string; error?: string }>;
    writeFile: (
      filePath: string,
      content: string,
    ) => Promise<{ success: boolean; error?: string }>;
    readDirectory: (
      dirPath: string,
    ) => Promise<{
      success: boolean;
      data?: FileSystemEntry[];
      error?: string;
    }>;
    selectDirectory: () => Promise<{
      success: boolean;
      data?: string;
      error?: string;
    }>;
    selectFile: () => Promise<{
      success: boolean;
      data?: string;
      error?: string;
    }>;
    findFile: (
      baseDir: string,
      fileName: string,
      extensions: string[],
    ) => Promise<{ success: boolean; data?: string | null; error?: string }>;
  };
  preview: {
    createTab: (url: string) => Promise<{ success: boolean; tabId?: string; error?: string }>;
    closeTab: (tabId: string) => Promise<{ success: boolean; error?: string }>;
    switchTab: (tabId: string) => Promise<{ success: boolean; error?: string }>;
    resizeActiveTab: (bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => Promise<{ success: boolean }>;
    hideAll: () => Promise<{ success: boolean }>;
    refresh: () => Promise<{ success: boolean }>;
    executeJavaScript: (
      script: string,
    ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    executeJavaScriptOnAll: (
      script: string,
    ) => Promise<{ success: boolean; results?: Array<{ tabId: string; success: boolean; data?: unknown; error?: string }>; error?: string }>;
    navigateCurrentTab: (url: string) => Promise<{ success: boolean; error?: string }>;
    captureScreenshot: (rect?: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => Promise<{ success: boolean; data?: string; error?: string }>;
  };
  models: {
    getAll: () => Promise<ModelConfig[]>;
    add: (
      model: ModelConfig,
    ) => Promise<{ success: boolean; data?: ModelConfig; error?: string }>;
    update: (
      modelId: string,
      updates: Partial<ModelConfig>,
    ) => Promise<{ success: boolean; data?: ModelConfig; error?: string }>;
    delete: (modelId: string) => Promise<{ success: boolean; error?: string }>;
    setActive: (
      modelId: string,
    ) => Promise<{ success: boolean; error?: string }>;
    getActive: () => Promise<ModelConfig | null>;
    testConnection: (
      modelConfig: Partial<ModelConfig>,
    ) => Promise<{ success: boolean; latency?: number; error?: string }>;
  };
  gateway: {
    getAll: () => Promise<GatewayProfile[]>;
    add: (
      profile: GatewayProfile,
    ) => Promise<{ success: boolean; data?: GatewayProfile; error?: string }>;
    update: (
      profileId: string,
      updates: Partial<GatewayProfile>,
    ) => Promise<{ success: boolean; data?: GatewayProfile; error?: string }>;
    delete: (
      profileId: string,
    ) => Promise<{ success: boolean; error?: string }>;
    setActive: (
      profileId: string,
    ) => Promise<{ success: boolean; data?: GatewayProfile; error?: string }>;
    getActive: () => Promise<GatewayProfile | null>;
    deactivate: () => Promise<{ success: boolean; error?: string }>;
    testConnection: (
      profile: Partial<GatewayProfile>,
    ) => Promise<{ success: boolean; latency?: number; error?: string }>;
    pullModels: (
      profile: Partial<GatewayProfile>,
    ) => Promise<{ success: boolean; models?: string[]; error?: string }>;
  };
  usage: {
    getStats: () => Promise<UsageStats>;
    updateStats: (stats: Partial<UsageStats>) => Promise<{ success: boolean }>;
  };
  sessions: {
    getAll: () => Promise<SessionData[]>;
    create: (
      session: SessionData,
    ) => Promise<{ success: boolean; data?: SessionData; error?: string }>;
    delete: (
      sessionId: string,
    ) => Promise<{ success: boolean; error?: string }>;
    archive: (
      sessionId: string,
    ) => Promise<{ success: boolean; error?: string }>;
    setActive: (
      sessionId: string,
    ) => Promise<{ success: boolean; error?: string }>;
    getActive: () => Promise<SessionData | null>;
    addMessage: (
      sessionId: string,
      message: ChatMessage,
    ) => Promise<{ success: boolean; error?: string }>;
    update: (
      sessionId: string,
      updates: Partial<SessionData>,
    ) => Promise<{ success: boolean; data?: SessionData; error?: string }>;
  };
  agent: {
    init: () => Promise<{ success: boolean; error?: string }>;
    sendMessage: (
      message: string,
      cwd?: string,
      annotations?: AnnotationContext[],
    ) => Promise<{ success: boolean; data?: AgentResponse; error?: string }>;
    abort: () => Promise<{ success: boolean }>;
    /** 流式输出 — 实时文本块 */
    onChunk: (callback: (text: string) => void) => void;
    /** 流式输出 — 状态更新 */
    onStatus: (callback: (status: string) => void) => void;
    /** 流式输出 — 工具调用 */
    onToolUse: (
      callback: (data: {
        toolName: string;
        input: Record<string, unknown>;
      }) => void,
    ) => void;
    /** 流式输出 — 工具调用结果 */
    onToolResult: (
      callback: (data: { toolName: string; status: string }) => void,
    ) => void;
    /** 流式输出 — 完成 */
    onDone: (
      callback: (usage: { inputTokens: number; outputTokens: number }) => void,
    ) => void;
    /** 流式输出 — 错误 */
    onError: (callback: (error: string) => void) => void;
    /** 清理所有流式监听器 */
    removeListeners: () => void;
  };
  theme: {
    get: () => Promise<"light" | "dark">;
    set: (theme: "light" | "dark") => Promise<{ success: boolean }>;
  };
  app: {
    getConfig: () => Promise<Record<string, unknown>>;
  };
  projects: {
    getRecent: () => Promise<string[]>;
    addRecent: (projectPath: string) => Promise<{ success: boolean }>;
    removeRecent: (projectPath: string) => Promise<{ success: boolean }>;
    getSessionsByProject: (projectPath: string) => Promise<SessionData[]>;
  };
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

/** 全局 Window 扩展 */
interface Window {
  electronAPI: ElectronAPI;
}
