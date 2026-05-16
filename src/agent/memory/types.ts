/**
 * MetaCode 本地 RAG 向量记忆系统类型定义
 * 遵循 sqlite-vec 规范
 */

/** Embedding 适配器统一接口 */
export interface EmbeddingProvider {
  readonly name: string;
  getEmbedding(text: string): Promise<number[]>;
  getEmbeddings(texts: string[]): Promise<number[][]>;
}

/** 向量数据库中的会话记录 */
export interface MemorySession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** 向量数据库中的消息记录 */
export interface MemoryMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
}

/** 向量记录 */
export interface MemoryVector {
  id: number;
  messageId: string;
  sessionId: string;
  summary: string;
  timestamp: string;
}

/** 相似度搜索结果 */
export interface SearchResult {
  messageId: string;
  sessionId: string;
  summary: string;
  content: string;
  timestamp: string;
  distance: number;
  similarity: number;
}

/** RAG 检索结果 */
export interface RAGResult {
  memories: SearchResult[];
  context: string;
  tokenEstimate: number;
}

/** RAG 系统配置 */
export interface MemoryConfig {
  enabled: boolean;
  recentRounds: number;
  maxContextTokens: number;
  similarityThreshold: number;
  maxRetrievedMemories: number;
  /** Embedding 模型名（如 text-embedding-3-small / bge-m3 / nomic-embed-text） */
  embeddingModel: string;
  /** Embedding API 地址（默认 OpenAI，可填 Ollama http://localhost:11434/v1） */
  embeddingBaseUrl: string;
  /** Embedding API Key（Ollama 等本地模型可留空） */
  embeddingApiKey: string;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: false,
  recentRounds: 5,
  maxContextTokens: 8000,
  similarityThreshold: 0.4,
  maxRetrievedMemories: 4,
  embeddingModel: "text-embedding-3-small",
  embeddingBaseUrl: "https://api.openai.com/v1",
  embeddingApiKey: "",
};

/** Embedding 提供商配置 */
export interface EmbeddingProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** 单次输入最大字符数，超出则自动截断（默认 8000） */
  maxInputLength?: number;
}

/** 记忆系统统计 */
export interface MemoryStats {
  sessionCount: number;
  messageCount: number;
  vectorCount: number;
  dbSize: number;
  usageLogCount: number;
}
