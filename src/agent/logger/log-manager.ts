/**
 * 日志管理器
 * 统一管理工具/MCP 调用日志的持久化存储
 * 支持按来源类型和名称关联，删除 tool/mcp 时级联删除日志
 */
import { LogDatabase } from "./database";
import type { ToolCallLog } from "../types";

export class LogManager {
  private db: LogDatabase;
  private dbPath: string | null = null;
  private initialized = false;

  constructor() {
    this.db = new LogDatabase();
  }

  /** 初始化数据库 */
  init(dbPath: string): void {
    if (this.initialized) return;
    this.dbPath = dbPath;
    this.db.init(dbPath);
    this.initialized = true;
  }

  private ensureInit(): void {
    if (!this.initialized) throw new Error("LogManager 未初始化，请先调用 init()");
  }

  /** 添加日志 */
  addLog(log: ToolCallLog): void {
    this.ensureInit();
    try {
      this.db.insertLog(log);
    } catch (err) {
      console.error("[LogManager] 写入日志失败:", err);
    }
  }

  /** 获取日志（分页 + 时间范围） */
  getLogs(limit = 200, offset = 0, filter?: { sourceType?: string; sourceName?: string; status?: string; startTime?: number; endTime?: number }): ToolCallLog[] {
    this.ensureInit();
    return this.db.getLogs(limit, offset, filter);
  }

  /** 按来源获取日志（用于级联删除前预览或导出） */
  getLogsBySource(sourceType: string, sourceName: string): ToolCallLog[] {
    this.ensureInit();
    return this.db.getLogsBySource(sourceType, sourceName);
  }

  /** 删除指定来源的所有日志（级联删除核心方法） */
  deleteLogsBySource(sourceType: string, sourceName: string): number {
    this.ensureInit();
    const deleted = this.db.deleteLogsBySource(sourceType, sourceName);
    if (deleted > 0) {
      console.log(`[LogManager] 已级联删除 ${deleted} 条日志 (${sourceType}/${sourceName})`);
    }
    return deleted;
  }

  /** 清空所有日志 */
  clearAll(): void {
    this.ensureInit();
    this.db.clearAll();
    console.log("[LogManager] 所有日志已清空");
  }

  /** 获取日志总数 */
  getCount(filter?: { sourceType?: string; sourceName?: string }): number {
    this.ensureInit();
    return this.db.getCount(filter);
  }

  /** 清理旧日志 */
  cleanOldLogs(daysAgo = 30): number {
    this.ensureInit();
    return this.db.deleteOldLogs(daysAgo);
  }

  /** 获取统计信息 */
  getStats() {
    this.ensureInit();
    return {
      totalCount: this.db.getCount(),
      dbSize: this.db.getDbSize(),
      dbPath: this.dbPath,
    };
  }

  /** 关闭数据库 */
  destroy(): void {
    this.db.close();
    this.initialized = false;
  }
}
