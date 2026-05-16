/**
 * Embedding 提供者统一接口 + 工厂函数
 * 兼容所有 OpenAI 格式的 Embedding 接口
 */
import type { EmbeddingProvider, EmbeddingProviderConfig } from "../types";

/** Embedding 模型最大输入字符数（通用默认值，约 2000 token） */
const DEFAULT_MAX_INPUT_LENGTH = 8000;

/** OpenAI 兼容 Embedding 实现 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "OpenAI Compatible";
  private config: EmbeddingProviderConfig;
  private maxInputLength: number;

  constructor(config: EmbeddingProviderConfig) {
    this.config = {
      baseUrl: "https://api.openai.com/v1",
      model: "text-embedding-3-small",
      ...config,
    };
    this.maxInputLength = config.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH;
  }

  async getEmbedding(text: string): Promise<number[]> {
    const results = await this.getEmbeddings([text]);
    return results[0];
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    // 截断超长文本，防止超出 Embedding 模型上下文限制
    const truncated = texts.map((t) =>
      t.length > this.maxInputLength
        ? t.slice(0, this.maxInputLength)
        : t,
    );

    const baseUrl = this.config.baseUrl!.replace(/\/+$/, "");
    const url = baseUrl.endsWith("/v1")
      ? `${baseUrl}/embeddings`
      : `${baseUrl}/v1/embeddings`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey
          ? { Authorization: `Bearer ${this.config.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        input: truncated,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown error");
      throw new Error(`Embedding API ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };
    const sorted = (data.data || []).sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}

/** 创建 Embedding 提供者 */
export function createEmbeddingProvider(
  config?: EmbeddingProviderConfig,
): EmbeddingProvider {
  if (!config || !config.baseUrl) {
    return new OpenAIEmbeddingProvider(config || {});
  }
  return new OpenAIEmbeddingProvider(config);
}
