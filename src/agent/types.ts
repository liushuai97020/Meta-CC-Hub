/**
 * MetaCode Agent 新系统类型定义
 * 基于 MCP (Model Context Protocol) 协议
 */

/** MCP 传输类型 */
export type MCPTransportType = "stdio" | "sse" | "http";

/** MCP 服务器配置（兼容 Claude Code / Cursor 等主流 mcp.json 格式） */
export interface MCPServerConfig {
  /** 传输类型，默认 stdio */
  type?: MCPTransportType;

  // ===== stdio 专用 =====
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;

  // ===== sse / http 专用 =====
  url?: string;
  headers?: Record<string, string>;

  /** 是否自动启动 */
  autoStart?: boolean;
  /** 禁用该服务器 */
  disabled?: boolean;
}

/** 整个 MCP 配置文件结构 */
export interface MCPConfigFile {
  mcpServers: Record<string, MCPServerConfig>;
}

/** MCP 服务器运行状态 */
export type MCPServerStatus = "starting" | "running" | "stopped" | "error";

/** MCP 服务器运行时信息 */
export interface MCPServerInstance {
  name: string;
  config: MCPServerConfig;
  status: MCPServerStatus;
  error?: string;
  tools: MCPToolMeta[];
}

/** MCP 工具元数据（来自 listTools） */
export interface MCPToolMeta {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

/** 工具调用日志 */
export interface ToolCallLog {
  id: string;
  toolName: string;
  serverName: string;
  /** 日志来源类型：mcp | built-in | local-tool */
  sourceType: "mcp" | "built-in" | "local-tool";
  /** 来源名称：MCP 服务器名或工具名（用于级联删除关联） */
  sourceName: string;
  input: Record<string, unknown>;
  output: string;
  status: "success" | "error";
  timestamp: number;
  duration: number;
}

/** Agent 配置 */
export interface AgentConfig {
  enabled: boolean;
  modelId?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  maxIterations: number;
  sandboxEnabled: boolean;
  confirmEachTool: boolean;
  composioApiKey?: string;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  maxIterations: 20,
  sandboxEnabled: true,
  confirmEachTool: false,
};

/** 技能定义 */
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  source: "built-in" | "custom" | "marketplace";
  executeMode: "serial" | "parallel";
  steps: SkillStep[];
}

/** 技能步骤 */
export interface SkillStep {
  id: string;
  toolName: string;
  description: string;
  params: Record<string, unknown>;
  /** 步骤间数据映射：上一步输出的字段 → 本步骤参数字段 */
  outputMap?: Record<string, string>;
}

/** 插件定义 */
export interface PluginMeta {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
}

/** 插件权限 */
export interface PluginPermissions {
  fileRead: boolean;
  fileWrite: boolean;
  network: boolean;
  terminal: boolean;
  clipboard: boolean;
  modelAccess: boolean;
}

/** 插件状态 */
export type PluginStatus = "enabled" | "disabled" | "error";

/** 插件实例 */
export interface PluginInstance {
  meta: PluginMeta;
  source: "built-in" | "marketplace" | "local";
  status: PluginStatus;
  permissions: PluginPermissions;
  /** 关联的 MCP 服务器名 */
  mcpServerName?: string;
  /** 关联的技能 ID 列表 */
  boundSkills: string[];
  /** 关联的工具名列表 */
  boundTools: string[];
}

/** 工具定义（用于工具管理器） */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  source: "built-in" | "local";
  filePath?: string;
  enabled?: boolean;
}

/** Agent 系统状态 */
export interface AgentSystemStatus {
  ready: boolean;
  serverCount: number;
  toolCount: number;
  skillCount: number;
  pluginCount: number;
  agentEngine: string;
}

/** Agent 执行回调 */
export interface AgentCallbacks {
  onStatus: (status: string) => void;
  onChunk: (text: string) => void;
  onToolStart: (toolName: string, input: Record<string, unknown>) => void;
  onToolEnd: (toolName: string, output: string, status: "success" | "error") => void;
  onError: (error: string) => void;
  onDone: (usage: { inputTokens: number; outputTokens: number }) => void;
}
