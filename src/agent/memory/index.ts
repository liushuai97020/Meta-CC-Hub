/**
 * MetaCode 本地 RAG 向量记忆系统
 * 省Token + 长期记忆
 *
 * 目录结构：
 * ├─ embedding/        # Embedding 适配器
 * ├─ vector-db/        # sqlite-vec 本地向量库
 * ├─ rag-engine.ts     # RAG 核心检索拼接
 * └─ memory-manager.ts # 记忆总管理器
 */
export { SQLiteVec } from "./vector-db";
export { RAGEngine } from "./rag-engine";
export { MemoryManager } from "./memory-manager";
export { createEmbeddingProvider, OpenAIEmbeddingProvider } from "./embedding";
export * from "./types";
