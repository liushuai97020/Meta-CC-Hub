/**
 * 记忆总管理器
 * 统筹 Embedding、向量库、RAG 引擎，对外暴露统一接口
 */
import path from "path";
import { app } from "electron";
import { SQLiteVec } from "./vector-db";
import { RAGEngine } from "./rag-engine";
import { createEmbeddingProvider } from "./embedding";
import type {
  MemoryConfig,
  MemorySession,
  MemoryMessage,
  EmbeddingProviderConfig,
  MemoryStats,
  SearchResult,
} from "./types";
import { DEFAULT_MEMORY_CONFIG } from "./types";

export class MemoryManager {
  private vectorDB: SQLiteVec;
  private ragEngine: RAGEngine;
  private config: MemoryConfig;
  private initialized = false;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.vectorDB = new SQLiteVec();
    this.ragEngine = new RAGEngine(this.vectorDB, this.config);
  }

  /** 初始化数据库和 Embedding 提供者 */
  initialize(embeddingConfig?: EmbeddingProviderConfig): void {
    if (this.initialized) return;

    // 数据库路径：userData/metacore-memory.db
    const userDataPath = app.getPath("userData");
    const dbPath = path.join(userDataPath, "metacore-memory.db");
    console.log("[MemoryManager] 数据库路径:", dbPath);

    this.vectorDB.init(dbPath);

    // 初始化 Embedding 提供者
    if (embeddingConfig) {
      const provider = createEmbeddingProvider(embeddingConfig);
      this.ragEngine.setEmbeddingProvider(provider);
    }

    this.initialized = true;
    console.log("[MemoryManager] 记忆系统初始化完成");
  }

  /** 配置 Embedding 提供者 */
  configureEmbedding(config: EmbeddingProviderConfig): void {
    const provider = createEmbeddingProvider(config);
    this.ragEngine.setEmbeddingProvider(provider);
    this.ragEngine.getConfig().enabled = true;
  }

  /** 更新 RAG 配置 */
  updateConfig(config: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...config };
    this.ragEngine.updateConfig(config);
  }

  /** 获取配置 */
  getConfig(): MemoryConfig {
    return this.ragEngine.getConfig();
  }

  // ========================
  // 会话管理
  // ========================

  createSession(id: string, title: string): MemorySession {
    this.vectorDB.createSession(id, title);
    return { id, title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }

  updateSession(id: string, updates: Partial<{ title: string }>): void {
    this.vectorDB.updateSession(id, updates);
  }

  getSession(id: string): MemorySession | null {
    return this.vectorDB.getSession(id);
  }

  getAllSessions(): MemorySession[] {
    return this.vectorDB.getAllSessions();
  }

  deleteSession(id: string): void {
    this.vectorDB.deleteSessionVectors(id);
    this.vectorDB.deleteSession(id);
  }

  // ========================
  // 消息管理
  // ========================

  addMessage(msg: MemoryMessage): void {
    this.vectorDB.insertMessage(msg);
  }

  getSessionMessages(sessionId: string, limit = 100, offset = 0): MemoryMessage[] {
    return this.vectorDB.getSessionMessages(sessionId, limit, offset);
  }

  getRecentRounds(sessionId: string, rounds: number): MemoryMessage[] {
    return this.vectorDB.getRecentRounds(sessionId, rounds);
  }

  // ========================
  // 向量记忆（异步：对话结束后调用）
  // ========================

  async memorize(
    messageId: string,
    sessionId: string,
    text: string,
    summary?: string,
  ): Promise<void> {
    const provider = this.ragEngine.getEmbeddingProvider();
    if (!provider || !this.config.enabled) return;

    try {
      // 超过 8000 字符的文本截断后再做 Embedding，防止超出模型上下文限制
      const safeText = text.length > 8000 ? text.slice(0, 8000) : text;
      const vector = await provider.getEmbedding(safeText);
      const finalSummary = summary || safeText.slice(0, 100);
      this.vectorDB.insertVector(messageId, sessionId, vector, finalSummary);
    } catch (err) {
      console.error("[MemoryManager] 记忆写入失败:", err);
    }
  }

  /** 批量记忆（对话完成后对整个对话做摘要并向量化） */
  async memorizeSessionMessages(
    sessionId: string,
    messages: MemoryMessage[],
  ): Promise<void> {
    if (!this.config.enabled) return;

    // 只对用户消息和助手回复做向量化
    const toVectorize = messages.filter(
      (m) => m.role === "user" || m.role === "assistant",
    );

    for (const msg of toVectorize) {
      // 检查是否已向量化（简单去重）
      try {
        await this.memorize(
          msg.id,
          sessionId,
          msg.content,
          msg.content.slice(0, 100),
        );
      } catch {
        // 单条失败不影响后续
      }
    }
  }

  // ========================
  // RAG 检索
  // ========================

  async retrieveMemories(
    query: string,
    sessionId?: string,
  ): Promise<{
    memories: SearchResult[];
    tokenEstimate: number;
  }> {
    return this.ragEngine.retrieve(query, sessionId);
  }

  buildContext(params: {
    systemPrompt: string;
    memories: SearchResult[];
    recentMessages: MemoryMessage[];
    currentQuery: string;
  }) {
    return this.ragEngine.buildContext(params);
  }

  /** 一站式 RAG：输入查询 + 会话，返回增强上下文 */
  async augmentQuery(
    query: string,
    sessionId: string,
    systemPrompt: string,
  ): Promise<{
    context: string;
    memories: SearchResult[];
    recentMessages: MemoryMessage[];
    tokenEstimate: number;
  }> {
    // 1. 检索记忆
    const { memories } = await this.retrieveMemories(query, sessionId);

    // 2. 获取最近 N 轮对话
    const recentMessages = this.vectorDB.getRecentRounds(
      sessionId,
      this.config.recentRounds,
    );

    // 3. 构建上下文
    const result = this.ragEngine.buildContext({
      systemPrompt,
      memories,
      recentMessages,
      currentQuery: query,
    });

    return {
      context: result.context,
      memories,
      recentMessages,
      tokenEstimate: result.tokenEstimate,
    };
  }

  // ========================
  // 用量统计
  // ========================

  logUsage(
    gatewayId: string | undefined,
    gatewayName: string | undefined,
    tokens: number,
    requests = 1,
  ): void {
    this.vectorDB.insertUsageLog(gatewayId, gatewayName, tokens, requests);
  }

  getUsageStats(startDate?: string, endDate?: string) {
    return this.vectorDB.getUsageStats(startDate, endDate);
  }

  // ========================
  // 系统操作
  // ========================

  getStats(): MemoryStats {
    return this.vectorDB.getStats();
  }

  clearAll(): void {
    this.vectorDB.clearAll();
  }

  destroy(): void {
    this.vectorDB.close();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
