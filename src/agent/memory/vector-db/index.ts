/**
 * sqlite-vec 本地向量数据库封装
 * 优先使用 vec0 虚拟表 + KNN MATCH 原生检索
 * 扩展不可用时自动降级为 JS 余弦相似度
 */
import type Database from "better-sqlite3";

import type {
  MemorySession,
  MemoryMessage,
  MemoryVector,
  SearchResult,
  MemoryStats,
} from "../types";

/** 默认向量维度 */
const DEFAULT_VECTOR_DIM = 1536;

export class SQLiteVec {
  private db: Database.Database | null = null;
  /** vec0 虚拟表是否可用 */
  private vec0Available = false;
  /** 当前 vec0 表的向量维度（首次插入时自动检测） */
  private currentDim = 0;

  /** 初始化数据库连接并建表 */
  init(dbPath: string): void {
    const BetterSqlite3 = require("better-sqlite3") as typeof Database;
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");

    this.db = new BetterSqlite3(dbPath);
    let vecLoaded = false;

    // 尝试加载 sqlite-vec 扩展
    try {
      const sqliteVec = require("sqlite-vec");
      const dllPath = sqliteVec.getLoadablePath();
      console.log("[SQLiteVec] DLL 路径:", dllPath);

      // 复制 DLL 到 userData 目录（避免 ASAR 解压路径加载问题）
      const localDir = path.dirname(dbPath);
      const localDll = path.join(localDir, "vec0.dll");
      if (dllPath !== localDll) {
        try { fs.unlinkSync(localDll); } catch {}
        fs.copyFileSync(dllPath, localDll);
        console.log("[SQLiteVec] DLL 已复制到:", localDll);
      }

      this.db.loadExtension(localDll);
      vecLoaded = true;
      console.log("[SQLiteVec] sqlite-vec 扩展加载成功");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[SQLiteVec] sqlite-vec 扩展加载失败: ${msg}`);
    }

    // 扩展加载失败：删旧库重建，避免残留 vec0 虚拟表
    if (!vecLoaded) {
      this.db.close();
      this.db = null;
      try { fs.unlinkSync(dbPath); fs.unlinkSync(dbPath + "-wal"); fs.unlinkSync(dbPath + "-shm"); } catch {}
      this.db = new BetterSqlite3(dbPath);
    }

    this.db.pragma("journal_mode = WAL");
    this.createTables();
  }

  /** 建表：vec0 优先，不可用时回退 BLOB 表 */
  private createTables(): void {
    if (!this.db) return;
    const db = this.db;

    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_session (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_message (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
        content TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES chat_session(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_message_session ON chat_message(session_id, timestamp);

      CREATE TABLE IF NOT EXISTS usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gateway_id TEXT,
        gateway_name TEXT,
        tokens INTEGER NOT NULL DEFAULT 0,
        requests INTEGER NOT NULL DEFAULT 1,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_logs(date);
      CREATE INDEX IF NOT EXISTS idx_usage_gateway ON usage_logs(gateway_id);
    `);

    // 检查 vec0 模块是否可用
    const hasVec0 =
      !!db
        .prepare("SELECT name FROM pragma_module_list WHERE name = 'vec0'")
        .get();

    if (hasVec0) {
      // 清理旧版 BLOB 格式表（非 vec0），vec0 虚拟表由 ensureVec0Dim 延迟创建
      const oldTable = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_vector'")
        .get() as { sql: string } | undefined;
      if (oldTable && !oldTable.sql.toUpperCase().includes("USING VEC0")) {
        db.exec("DROP TABLE IF EXISTS chat_vector");
        db.exec("DROP TABLE IF EXISTS chat_vector_meta");
        console.log("[SQLiteVec] 已删除旧版 BLOB 格式表");
      }

      // 元数据表（与 vec0 虚拟表配合，后者由首次 embedding 调用时按实际维度创建）
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_vector_meta (
          id INTEGER PRIMARY KEY,
          message_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          timestamp TEXT NOT NULL,
          FOREIGN KEY (message_id) REFERENCES chat_message(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_meta_session ON chat_vector_meta(session_id);
      `);
      this.vec0Available = true;
      console.log("[SQLiteVec] vec0 模块已就绪（向量表将在首次使用时按实际维度创建）");
    } else {
      console.log("[SQLiteVec] vec0 模块不可用，使用 BLOB + JS 余弦相似度");
      this.createFallbackTable();
    }
  }

  /** BLOB 存储表（降级方案） */
  private createFallbackTable(): void {
    this.vec0Available = false;

    // 如果此前 vec0 扩展可用时创建了虚拟表，需清理后重建为 BLOB 表
    const existingTable = this.db!
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_vector'")
      .get() as { sql: string } | undefined;

    if (existingTable && existingTable.sql.toUpperCase().includes("USING VEC0")) {
      this.db!.exec("DROP TABLE IF EXISTS chat_vector");
      this.db!.exec("DROP TABLE IF EXISTS chat_vector_meta");
      console.log("[SQLiteVec] 已清理旧 vec0 虚拟表，降级为 BLOB 存储");
    }

    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS chat_vector (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        vector BLOB NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL,
        FOREIGN KEY (message_id) REFERENCES chat_message(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_vector_session ON chat_vector(session_id);
    `);
  }

  /** 检查 DB 是否已初始化 */
  private checkDB(): Database.Database {
    if (!this.db) throw new Error("数据库未初始化，请先调用 init()");
    return this.db;
  }

  // ========================
  // 会话操作
  // ========================

  createSession(id: string, title: string): void {
    const now = new Date().toISOString();
    this.checkDB()
      .prepare(
        "INSERT OR REPLACE INTO chat_session (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, title, now, now);
  }

  updateSession(id: string, updates: Partial<{ title: string }>): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (updates.title !== undefined) {
      sets.push("title = ?");
      vals.push(updates.title);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    vals.push(new Date().toISOString());
    vals.push(id);
    this.checkDB()
      .prepare(`UPDATE chat_session SET ${sets.join(", ")} WHERE id = ?`)
      .run(...vals);
  }

  getSession(id: string): MemorySession | null {
    const row = this.checkDB()
      .prepare("SELECT * FROM chat_session WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapSession(row);
  }

  getAllSessions(): MemorySession[] {
    const rows = this.checkDB()
      .prepare("SELECT * FROM chat_session ORDER BY updated_at DESC")
      .all() as Record<string, unknown>[];
    return rows.map(this.mapSession);
  }

  deleteSession(id: string): void {
    this.checkDB()
      .prepare("DELETE FROM chat_session WHERE id = ?")
      .run(id);
  }

  // ========================
  // 消息操作
  // ========================

  insertMessage(msg: MemoryMessage): void {
    this.checkDB()
      .prepare(
        "INSERT OR REPLACE INTO chat_message (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)",
      )
      .run(msg.id, msg.sessionId, msg.role, msg.content, msg.timestamp);
  }

  getSessionMessages(
    sessionId: string,
    limit = 100,
    offset = 0,
  ): MemoryMessage[] {
    const rows = this.checkDB()
      .prepare(
        "SELECT * FROM chat_message WHERE session_id = ? ORDER BY timestamp ASC, rowid ASC LIMIT ? OFFSET ?",
      )
      .all(sessionId, limit, offset) as Record<string, unknown>[];
    return rows.map(this.mapMessage);
  }

  getRecentRounds(sessionId: string, rounds: number): MemoryMessage[] {
    const rows = this.checkDB()
      .prepare(
        "SELECT * FROM chat_message WHERE session_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?",
      )
      .all(sessionId, rounds * 4) as Record<string, unknown>[];
    return rows.reverse().map(this.mapMessage);
  }

  getMessageCount(sessionId: string): number {
    const row = this.checkDB()
      .prepare("SELECT COUNT(*) as cnt FROM chat_message WHERE session_id = ?")
      .get(sessionId) as { cnt: number };
    return row.cnt;
  }

  // ========================
  // 向量操作
  // ========================

  /** 确保 vec0 表维度与实际向量匹配，不一致则自动重建 */
  private ensureVec0Dim(actualDim: number): void {
    const db = this.checkDB();

    if (this.currentDim === 0) {
      const tableInfo = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_vector'",
        )
        .get() as { sql: string } | undefined;
      if (tableInfo?.sql) {
        const match = tableInfo.sql.match(/float\[(\d+)\]/);
        this.currentDim = match ? parseInt(match[1]) : actualDim;
      } else {
        // 表不存在，首次创建
        this.currentDim = actualDim;
        this.recreateVec0Table(db, actualDim);
      }
    }

    if (actualDim === this.currentDim) return;

    console.log(
      `[SQLiteVec] 向量维度变化 ${this.currentDim} -> ${actualDim}，重建 vec0 表`,
    );
    this.currentDim = actualDim;
    this.recreateVec0Table(db, actualDim);
  }

  /** 删除并重建 vec0 虚拟表 + meta 表 */
  private recreateVec0Table(db: Database.Database, dim: number): void {
    db.exec("DROP TABLE IF EXISTS chat_vector");
    db.exec("DROP TABLE IF EXISTS chat_vector_meta");
    db.exec(
      `CREATE VIRTUAL TABLE chat_vector USING vec0(embedding float[${dim}])`,
    );
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_vector_meta (
        id INTEGER PRIMARY KEY,
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL,
        FOREIGN KEY (message_id) REFERENCES chat_message(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_meta_session ON chat_vector_meta(session_id);
    `);
  }

  insertVector(
    messageId: string,
    sessionId: string,
    vector: number[],
    summary: string,
  ): void {
    const db = this.checkDB();
    const ts = new Date().toISOString();

    if (this.vec0Available) {
      this.ensureVec0Dim(vector.length);

      // vec0：先插入向量获取 rowid，再插入元数据
      const json = JSON.stringify(vector);
      const result = db
        .prepare("INSERT INTO chat_vector (embedding) VALUES (?)")
        .run(json);
      const rowid = result.lastInsertRowid;
      db.prepare(
        "INSERT INTO chat_vector_meta (id, message_id, session_id, summary, timestamp) VALUES (?, ?, ?, ?, ?)",
      ).run(rowid, messageId, sessionId, summary, ts);
    } else {
      const buf = this.vectorToBuffer(vector);
      db.prepare(
        "INSERT INTO chat_vector (message_id, session_id, vector, summary, timestamp) VALUES (?, ?, ?, ?, ?)",
      ).run(messageId, sessionId, buf, summary, ts);
    }
  }

  /** 向量相似度搜索 */
  searchSimilar(
    queryVector: number[],
    limit: number,
    threshold: number,
    sessionId?: string,
  ): SearchResult[] {
    const db = this.checkDB();

    if (this.vec0Available) {
      return this.searchViaVec0(db, queryVector, limit, threshold, sessionId);
    }
    return this.searchViaJS(db, queryVector, limit, threshold, sessionId);
  }

  /** vec0 虚拟表 KNN MATCH 检索 */
  private searchViaVec0(
    db: Database.Database,
    queryVector: number[],
    limit: number,
    threshold: number,
    sessionId?: string,
  ): SearchResult[] {
    this.ensureVec0Dim(queryVector.length);

    const queryJson = JSON.stringify(queryVector);

    // vec0 KNN 必须在子查询中独立执行（JOIN 场景下 LIMIT/k 无法下推）
    const sql = sessionId
      ? `SELECT m.message_id, m.session_id, m.summary, m.timestamp, v.distance
         FROM (
           SELECT rowid, distance
           FROM chat_vector
           WHERE embedding MATCH ? AND k = ?
           ORDER BY distance
         ) v
         JOIN chat_vector_meta m ON v.rowid = m.id
         WHERE m.session_id = ?`
      : `SELECT m.message_id, m.session_id, m.summary, m.timestamp, v.distance
         FROM (
           SELECT rowid, distance
           FROM chat_vector
           WHERE embedding MATCH ? AND k = ?
           ORDER BY distance
         ) v
         JOIN chat_vector_meta m ON v.rowid = m.id`;

    const rows = sessionId
      ? (db.prepare(sql).all(queryJson, limit, sessionId) as Array<
          Record<string, unknown>
        >)
      : (db.prepare(sql).all(queryJson, limit) as Array<
          Record<string, unknown>
        >);

    return rows
      .map((r) => {
        const dist = Number(r.distance);
        return {
          messageId: r.message_id as string,
          sessionId: r.session_id as string,
          summary: (r.summary as string) || "",
          content: "",
          timestamp: r.timestamp as string,
          distance: dist,
          similarity: 1 - dist,
        };
      })
      .filter((r) => r.similarity >= threshold);
  }

  /** JS 余弦相似度降级方案 */
  private searchViaJS(
    db: Database.Database,
    queryVector: number[],
    limit: number,
    threshold: number,
    sessionId?: string,
  ): SearchResult[] {
    const allVectors = sessionId
      ? (db
          .prepare("SELECT * FROM chat_vector WHERE session_id = ?")
          .all(sessionId) as Record<string, unknown>[])
      : (db.prepare("SELECT * FROM chat_vector").all() as Record<
          string,
          unknown
        >[]);

    const results: Array<SearchResult & { _sort: number }> = [];
    for (const row of allVectors) {
      const vec = this.bufferToVector(row.vector as Buffer);
      const sim = this.cosineSimilarity(queryVector, vec);
      if (sim >= threshold) {
        results.push({
          messageId: row.message_id as string,
          sessionId: row.session_id as string,
          summary: (row.summary as string) || "",
          content: "",
          timestamp: row.timestamp as string,
          distance: 1 - sim,
          similarity: sim,
          _sort: sim,
        });
      }
    }

    results.sort((a, b) => b._sort - a._sort);
    return results.slice(0, limit).map(({ _sort, ...rest }) => rest);
  }

  /** 补充消息内容到搜索结果 */
  enrichResults(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) return results;
    const db = this.checkDB();
    const stmt = db.prepare("SELECT content FROM chat_message WHERE id = ?");
    for (const r of results) {
      const row = stmt.get(r.messageId) as { content: string } | undefined;
      if (row) r.content = row.content;
    }
    return results;
  }

  deleteSessionVectors(sessionId: string): void {
    const db = this.checkDB();
    if (this.vec0Available) {
      // meta 表有 session_id，删除时联动删除 vec0 中对应 rowid 的行
      const rows = db
        .prepare("SELECT id FROM chat_vector_meta WHERE session_id = ?")
        .all(sessionId) as Array<{ id: number }>;
      for (const r of rows) {
        db.prepare("DELETE FROM chat_vector WHERE rowid = ?").run(r.id);
      }
      db.prepare("DELETE FROM chat_vector_meta WHERE session_id = ?").run(sessionId);
    } else {
      db.prepare("DELETE FROM chat_vector WHERE session_id = ?").run(sessionId);
    }
  }

  getVectorCount(): number {
    // vec0 虚拟表不支持 COUNT 聚合，统一从 meta 读
    if (this.vec0Available) {
      const row = this.checkDB()
        .prepare("SELECT COUNT(*) as cnt FROM chat_vector_meta")
        .get() as { cnt: number };
      return row.cnt;
    }
    const row = this.checkDB()
      .prepare("SELECT COUNT(*) as cnt FROM chat_vector")
      .get() as { cnt: number };
    return row.cnt;
  }

  // ========================
  // 用量日志
  // ========================

  insertUsageLog(
    gatewayId: string | undefined,
    gatewayName: string | undefined,
    tokens: number,
    requests: number,
  ): void {
    const today = new Date().toISOString().slice(0, 10);
    this.checkDB()
      .prepare(
        "INSERT INTO usage_logs (gateway_id, gateway_name, tokens, requests, date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        gatewayId || null,
        gatewayName || null,
        tokens,
        requests,
        today,
        new Date().toISOString(),
      );
  }

  getUsageStats(
    startDate?: string,
    endDate?: string,
  ): {
    totalTokens: number;
    totalRequests: number;
    dailyStats: Array<{ date: string; tokens: number; requests: number }>;
    gatewayStats: Record<
      string,
      {
        gatewayId: string;
        gatewayName: string;
        totalTokens: number;
        totalRequests: number;
      }
    >;
  } {
    const db = this.checkDB();
    const dateFilter =
      startDate && endDate ? "WHERE date >= ? AND date <= ?" : "";
    const params: string[] = [];
    if (startDate && endDate) params.push(startDate, endDate);

    const totals = db
      .prepare(
        `SELECT COALESCE(SUM(tokens),0) as tokens, COALESCE(SUM(requests),0) as requests FROM usage_logs ${dateFilter}`,
      )
      .get(...params) as { tokens: number; requests: number };

    const dailyRows = db
      .prepare(
        `SELECT date, SUM(tokens) as tokens, SUM(requests) as requests FROM usage_logs ${dateFilter ? dateFilter + " " : ""}GROUP BY date ORDER BY date DESC LIMIT 90`,
      )
      .all(...params) as Array<{
      date: string;
      tokens: number;
      requests: number;
    }>;

    const gwRows = db
      .prepare(
        `SELECT gateway_id, gateway_name, SUM(tokens) as tokens, SUM(requests) as requests FROM usage_logs WHERE gateway_id IS NOT NULL ${dateFilter ? "AND date >= ? AND date <= ?" : ""} GROUP BY gateway_id`,
      )
      .all(...params) as Array<{
      gateway_id: string;
      gateway_name: string;
      tokens: number;
      requests: number;
    }>;

    const gatewayStats: Record<string, any> = {};
    for (const g of gwRows) {
      gatewayStats[g.gateway_id] = {
        gatewayId: g.gateway_id,
        gatewayName: g.gateway_name,
        totalTokens: g.tokens,
        totalRequests: g.requests,
      };
    }

    return {
      totalTokens: totals.tokens,
      totalRequests: totals.requests,
      dailyStats: dailyRows.reverse(),
      gatewayStats,
    };
  }

  // ========================
  // 工具方法
  // ========================

  getStats(): MemoryStats {
    const db = this.checkDB();
    const sessionCount = (
      db
        .prepare("SELECT COUNT(*) as cnt FROM chat_session")
        .get() as { cnt: number }
    ).cnt;
    const messageCount = (
      db
        .prepare("SELECT COUNT(*) as cnt FROM chat_message")
        .get() as { cnt: number }
    ).cnt;
    const vectorCount = this.vec0Available
      ? (
          db
            .prepare("SELECT COUNT(*) as cnt FROM chat_vector_meta")
            .get() as { cnt: number }
        ).cnt
      : (
          db
            .prepare("SELECT COUNT(*) as cnt FROM chat_vector")
            .get() as { cnt: number }
        ).cnt;
    const usageLogCount = (
      db
        .prepare("SELECT COUNT(*) as cnt FROM usage_logs")
        .get() as { cnt: number }
    ).cnt;

    let dbSize = 0;
    try {
      const { statSync } = require("fs");
      const { join } = require("path");
      const sizePath = join(db.name || "");
      if (sizePath) dbSize = statSync(sizePath).size;
    } catch {}

    return { sessionCount, messageCount, vectorCount, dbSize, usageLogCount };
  }

  clearAll(): void {
    const db = this.checkDB();
    if (this.vec0Available) {
      db.exec(`
        DELETE FROM chat_vector;
        DELETE FROM chat_vector_meta;
        DELETE FROM chat_message;
        DELETE FROM chat_session;
        DELETE FROM usage_logs;
      `);
    } else {
      db.exec(`
        DELETE FROM chat_vector;
        DELETE FROM chat_message;
        DELETE FROM chat_session;
        DELETE FROM usage_logs;
      `);
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  // ========================
  // 内部辅助
  // ========================

  private vectorToBuffer(vec: number[]): Buffer {
    const floats = new Float32Array(vec);
    return Buffer.from(floats.buffer);
  }

  private bufferToVector(buf: Buffer): number[] {
    const floats = new Float32Array(
      buf.buffer,
      buf.byteOffset,
      buf.byteLength / 4,
    );
    return Array.from(floats);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }

  private mapSession(row: Record<string, unknown>): MemorySession {
    return {
      id: row.id as string,
      title: row.title as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapMessage(row: Record<string, unknown>): MemoryMessage {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      role: row.role as MemoryMessage["role"],
      content: row.content as string,
      timestamp: row.timestamp as string,
    };
  }
}
