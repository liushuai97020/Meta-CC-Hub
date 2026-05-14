/**
 * 主进程类型定义
 */

type ModelType = 'official' | 'third-party' | 'local';

type ProviderMode = 'custom' | 'deepseek';

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
  apiFormat?: 'anthropic' | 'openai';
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
  provider?: 'custom' | 'deepseek';
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  maxTokens?: number;
  temperature?: number;
  apiFormat?: 'anthropic' | 'openai';
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

interface DailyUsage {
  date: string;
  tokens: number;
  requests: number;
}

interface GatewayUsage {
  gatewayId: string;
  gatewayName: string;
  totalTokens: number;
  totalRequests: number;
  dailyStats: DailyUsage[];
}

interface UsageStats {
  totalTokens: number;
  totalRequests: number;
  dailyStats: DailyUsage[];
  gatewayStats: Record<string, GatewayUsage>;
}

interface StoreSchema {
  models: ModelConfig[];
  activeModelId: string | null;
  gatewayProfiles: GatewayProfile[];
  activeGatewayId: string | null;
  sessions: SessionData[];
  activeSessionId: string | null;
  recentProjects: string[];
  theme: 'light' | 'dark';
  windowBounds: { width: number; height: number };
  usageStats: UsageStats;
}
