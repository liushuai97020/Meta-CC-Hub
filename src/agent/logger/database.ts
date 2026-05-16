/**
 * 工具调用日志 SQLite 数据库
 * 独立于记忆系统，使用单独的 metacore-logs.db
 */
import type Database from "better-sqlite3";
import type { ToolCallLog } from "../types";

export class LogDatabase {
  private db: Database.Database | null = null;

  /** 初始化数据库连接并建表 */
  init(dbPath: string): void {
    const BetterSqlite3 = require("better-sqlite3") as typeof Database;
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.createTables();
    console.log("[LogDatabase] 日志数据库已初始化:", dbPath);
  }

  private createTables(): void {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_call_logs (
        id TEXT PRIMARY KEY,
        tool_name TEXT NOT NULL,
        server_name TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT 'mcp',
        source_name TEXT NOT NULL DEFAULT '',
        input TEXT NOT NULL DEFAULT '{}',
        output TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'success',
        timestamp INTEGER NOT NULL,
        duration INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_logs_source ON tool_call_logs(source_type, source_name);
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON tool_call_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_logs_tool_name ON tool_call_logs(tool_name);
    `);
  }

  private checkDB(): Database.Database {
    if (!this.db) throw new Error("日志数据库未初始化，请先调用 init()");
    return this.db;
  }

  /** 插入单条日志 */
  insertLog(log: ToolCallLog): void {
    this.checkDB()
      .prepare(
        `INSERT INTO tool_call_logs (id, tool_name, server_name, source_type, source_name, input, output, status, timestamp, duration)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        log.id,
        log.toolName,
        log.serverName,
        log.sourceType || "mcp",
        log.sourceName || "",
        JSON.stringify(log.input),
        log.output,
        log.status,
        log.timestamp,
        log.duration,
      );
  }

  /** 查询日志（支持分页、过滤、时间范围） */
  getLogs(
    limit = 200,
    offset = 0,
    filter?: { sourceType?: string; sourceName?: string; status?: string; startTime?: number; endTime?: number },
  ): ToolCallLog[] {
    const db = this.checkDB();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.sourceType) {
      conditions.push("source_type = ?");
      params.push(filter.sourceType);
    }
    if (filter?.sourceName) {
      conditions.push("source_name = ?");
      params.push(filter.sourceName);
    }
    if (filter?.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }
    if (filter?.startTime) {
      conditions.push("timestamp >= ?");
      params.push(filter.startTime);
    }
    if (filter?.endTime) {
      conditions.push("timestamp <= ?");
      params.push(filter.endTime);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT * FROM tool_call_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Record<string, unknown>[];

    return rows.map(this.mapLog);
  }

  /** 按来源查询日志 */
  getLogsBySource(sourceType: string, sourceName: string): ToolCallLog[] {
    const rows = this.checkDB()
      .prepare(
        "SELECT * FROM tool_call_logs WHERE source_type = ? AND source_name = ? ORDER BY timestamp DESC",
      )
      .all(sourceType, sourceName) as Record<string, unknown>[];
    return rows.map(this.mapLog);
  }

  /** 删除指定来源的日志（级联删除：删除 tool/mcp 时调用） */
  deleteLogsBySource(sourceType: string, sourceName: string): number {
    const result = this.checkDB()
      .prepare("DELETE FROM tool_call_logs WHERE source_type = ? AND source_name = ?")
      .run(sourceType, sourceName);
    return result.changes;
  }

  /** 清空所有日志 */
  clearAll(): void {
    this.checkDB().exec("DELETE FROM tool_call_logs");
  }

  /** 获取日志总数 */
  getCount(filter?: { sourceType?: string; sourceName?: string }): number {
    const db = this.checkDB();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter?.sourceType) { conditions.push("source_type = ?"); params.push(filter.sourceType); }
    if (filter?.sourceName) { conditions.push("source_name = ?"); params.push(filter.sourceName); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const row = db
      .prepare(`SELECT COUNT(*) as cnt FROM tool_call_logs ${where}`)
      .get(...params) as { cnt: number };
    return row.cnt;
  }

  /** 清理 N 天前的旧日志 */
  deleteOldLogs(daysAgo = 30): number {
    const cutoff = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
    const result = this.checkDB()
      .prepare("DELETE FROM tool_call_logs WHERE timestamp < ?")
      .run(cutoff);
    return result.changes;
  }

  /** 获取数据库文件大小 */
  getDbSize(): number {
    try {
      const { statSync } = require("fs");
      return statSync(this.db!.name).size;
    } catch {
      return 0;
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  /** 行映射为 ToolCallLog */
  private mapLog(row: Record<string, unknown>): ToolCallLog {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse((row.input as string) || "{}");
    } catch { /* ignore */ }

    return {
      id: row.id as string,
      toolName: row.tool_name as string,
      serverName: row.server_name as string,
      sourceType: row.source_type as ToolCallLog["sourceType"],
      sourceName: row.source_name as string,
      input,
      output: row.output as string,
      status: row.status as ToolCallLog["status"],
      timestamp: row.timestamp as number,
      duration: row.duration as number,
    };
  }
}
