/**
 * 预加载脚本类型定义
 */

type ModelType = 'official' | 'third-party' | 'local';
type ConnectionStatus = 'unknown' | 'testing' | 'connected' | 'error';

interface ProxyConfig {
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

interface GatewayProfile {
  id: string;
  name: string;
  type: ModelType;
  baseUrl: string;
  apiKey?: string;
  provider?: 'custom' | 'deepseek';
  proxy?: ProxyConfig;
  defaultModel: string;
  expertModel: string;
  smallModel: string;
  analysisModel: string;
  imageModel: string;
  availableModels: string[];
  connectionStatus?: ConnectionStatus;
  lastTestedAt?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ModelConfig {
  id: string;
  name: string;
  type: ModelType;
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  maxTokens?: number;
  temperature?: number;
  group?: string;
  proxy?: ProxyConfig;
  connectionStatus?: ConnectionStatus;
  lastTestedAt?: string;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: ToolCallResult[];
  relatedFiles?: string[];
}

interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  status: 'success' | 'error';
  error?: string;
}

interface SessionData {
  id: string;
  title: string;
  projectPath?: string;
  messages: ChatMessage[];
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FileSystemEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  children?: FileSystemEntry[];
}

interface DailyUsage {
  date: string;
  tokens: number;
  requests: number;
}

interface UsageStats {
  totalTokens: number;
  totalRequests: number;
  dailyStats: DailyUsage[];
}

interface ElementAnnotation {
  tagName: string;
  id: string | null;
  className: string | null;
  selector: string;
  textContent: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
  attributes: Array<{ name: string; value: string }>;
  screenshot?: string;
}

type ExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'warning';

interface DiagnosticInfo {
  status: ExecutionStatus;
  message?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

interface AgentResponse {
  content: string;
  toolCalls?: ToolCallResult[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
