/**
 * RAG 核心引擎
 * 负责：向量检索、记忆拼接、上下文构建、Token 控制
 */
import type { SQLiteVec } from "./vector-db";
import type {
  EmbeddingProvider,
  SearchResult,
  RAGResult,
  MemoryConfig,
  MemoryMessage,
} from "./types";
import { DEFAULT_MEMORY_CONFIG } from "./types";

/** 粗略 Token 估算（中英文混合） */
function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    // 中文字符 ≈ 2 tokens
    if (/[一-鿿㐀-䶿豈-﫿]/.test(char)) {
      tokens += 2;
    } else {
      tokens += 0.25; // 英文/数字 ≈ 0.25 token
    }
  }
  return Math.ceil(tokens);
}

/** 按 Token 上限截断文本，保留完整句子 */
function truncateToLimit(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;

  let tokens = 0;
  let cutIndex = text.length;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    tokens += /[一-鿿]/.test(char) ? 2 : 0.25;
    if (tokens > maxTokens) {
      cutIndex = i;
      break;
    }
  }
  // 在截断位置附近找最近的句号/换行
  const breakChars = ["。", "\n", ".", "!", "?", "！", "？"];
  let breakAt = cutIndex;
  for (const bc of breakChars) {
    const idx = text.lastIndexOf(bc, cutIndex);
    if (idx > cutIndex * 0.7) {
      breakAt = idx + 1;
      break;
    }
  }
  return text.slice(0, breakAt) + "\n\n...（已截断）";
}

export class RAGEngine {
  private vectorDB: SQLiteVec;
  private embeddingProvider: EmbeddingProvider | null = null;
  private config: MemoryConfig;

  constructor(
    vectorDB: SQLiteVec,
    config?: Partial<MemoryConfig>,
  ) {
    this.vectorDB = vectorDB;
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
  }

  /** 更新配置 */
  updateConfig(config: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** 获取配置 */
  getConfig(): MemoryConfig {
    return { ...this.config };
  }

  /** 设置 Embedding 提供者 */
  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  /** 获取 Embedding 提供者 */
  getEmbeddingProvider(): EmbeddingProvider | null {
    return this.embeddingProvider;
  }

  /** 执行 RAG 检索 */
  async retrieve(
    query: string,
    sessionId?: string,
  ): Promise<{
    memories: SearchResult[];
    tokenEstimate: number;
  }> {
    if (!this.config.enabled || !this.embeddingProvider) {
      return { memories: [], tokenEstimate: 0 };
    }

    try {
      // 1. 生成查询向量
      const queryVector = await this.embeddingProvider.getEmbedding(query);

      // 2. 相似度搜索
      const rawResults = this.vectorDB.searchSimilar(
        queryVector,
        this.config.maxRetrievedMemories,
        this.config.similarityThreshold,
      );

      // 3. 补充消息内容
      const enriched = this.vectorDB.enrichResults(rawResults);

      // 4. 估算 Token
      const memText = enriched
        .map((m) => `[${m.timestamp}] ${m.summary}\n${m.content}`)
        .join("\n\n");
      const tokenEstimate = estimateTokens(memText);

      return { memories: enriched, tokenEstimate };
    } catch (err) {
      console.error("[RAGEngine] 检索失败:", err);
      return { memories: [], tokenEstimate: 0 };
    }
  }

  /**
   * 构建最终上下文
   * 格式：
   * 【系统提示】
   * ...
   *
   * 【历史相关记忆（向量检索）】
   * ...
   *
   * 【最近 N 轮对话】
   * ...
   *
   * 【用户当前提问】
   * ...
   */
  buildContext(params: {
    systemPrompt: string;
    memories: SearchResult[];
    recentMessages: MemoryMessage[];
    currentQuery: string;
  }): RAGResult {
    const { systemPrompt, memories, recentMessages, currentQuery } = params;
    const parts: string[] = [];

    // 系统提示
    parts.push("【系统提示】");
    parts.push(systemPrompt);
    parts.push("");

    // 向量检索的历史记忆
    if (memories.length > 0) {
      parts.push("【历史相关记忆（向量检索出来的）】");
      for (const mem of memories) {
        const time = mem.timestamp
          ? new Date(mem.timestamp).toLocaleString("zh-CN")
          : "未知时间";
        parts.push(`- 时间：${time}`);
        parts.push(`  内容：${mem.summary || mem.content.slice(0, 200)}`);
        parts.push("");
      }
      parts.push("");
    }

    // 最近 N 轮对话
    if (recentMessages.length > 0) {
      parts.push(`【最近${this.config.recentRounds}轮完整对话】`);
      for (const msg of recentMessages) {
        const roleLabel =
          msg.role === "user"
            ? "用户"
            : msg.role === "assistant"
              ? "助手"
              : msg.role === "system"
                ? "系统"
                : "工具";
        parts.push(`${roleLabel}: ${msg.content}`);
      }
      parts.push("");
    }

    // 当前问题
    parts.push("【用户当前提问】");
    parts.push(currentQuery);

    const fullContext = parts.join("\n");
    const totalTokens = estimateTokens(fullContext);

    // 如果超出 Token 限制，从历史记忆开始裁剪
    if (totalTokens > this.config.maxContextTokens) {
      const truncated = truncateToLimit(fullContext, this.config.maxContextTokens);
      return {
        memories,
        context: truncated,
        tokenEstimate: estimateTokens(truncated),
      };
    }

    return {
      memories,
      context: fullContext,
      tokenEstimate: totalTokens,
    };
  }

  /** 估算文本 Token 数 */
  estimateTokens(text: string): number {
    return estimateTokens(text);
  }
}
