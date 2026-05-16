/**
 * MCP 客户端封装
 * 基于 @modelcontextprotocol/sdk 的高层 API
 * 提供工具注册、调用、日志收集（SQLite 持久化）
 */

import { randomUUID } from "node:crypto";
import { MCPServerManager } from "./server-manager";
import type { MCPToolMeta, ToolCallLog, MCPServerConfig } from "../types";
import { readMCPConfigSync } from "./config";
import type { LogManager } from "../logger";

export class MCPClient {
  readonly serverManager: MCPServerManager;
  private logManager: LogManager | null = null;

  constructor() {
    this.serverManager = new MCPServerManager((name, status) => {
      console.log(`[MCPClient] 服务器 "${name}" 状态变更: ${status}`);
    });
  }

  /** 设置日志管理器（由 AgentSystem 注入） */
  setLogManager(lm: LogManager): void {
    this.logManager = lm;
  }

  /** 初始化：读取配置并启动所有服务器 */
  async initialize(): Promise<void> {
    const config = readMCPConfigSync();
    const servers = config.mcpServers || {};
    console.log(`[MCPClient] 发现 ${Object.keys(servers).length} 个 MCP 服务器配置`);
    await this.serverManager.startAll(servers);
  }

  /** 重新加载配置并重启 */
  async reload(): Promise<void> {
    await this.serverManager.stopAll();
    await this.initialize();
  }

  /** 获取所有工具 */
  getAllTools(): MCPToolMeta[] {
    return this.serverManager.getAllTools();
  }

  /** 获取工具数量 */
  get count(): number {
    return this.serverManager.getAllTools().length;
  }

  /** 获取所有服务器实例 */
  getAllServers() {
    return this.serverManager.getAllInstances();
  }

  /** 获取服务器概览数量 */
  get serverCount(): number {
    return this.serverManager.getTotalCount();
  }

  /** 添加或更新服务器配置并启动 */
  async addServer(name: string, config: MCPServerConfig): Promise<boolean> {
    const { upsertMCPServer } = await import("./config.js");
    await upsertMCPServer(name, config);
    const ok = await this.serverManager.startServer(name, config);
    if (!ok) {
      const instance = this.serverManager.getInstance(name);
      const errMsg = instance?.error || "服务器启动失败，请检查配置";
      throw new Error(errMsg);
    }
    return true;
  }

  /** 移除服务器（级联删除关联日志） */
  async removeServer(name: string): Promise<void> {
    const { removeMCPServer } = await import("./config.js");
    await this.serverManager.stopServer(name);
    await removeMCPServer(name);
    // 级联删除关联日志
    this.logManager?.deleteLogsBySource("mcp", name);
  }

  /** 重启指定服务器 */
  async restartServer(name: string): Promise<boolean> {
    const instance = this.serverManager.getInstance(name);
    if (!instance) throw new Error(`服务器 "${name}" 不存在`);
    const ok = await this.serverManager.restartServer(name, instance.config);
    if (!ok) {
      const fresh = this.serverManager.getInstance(name);
      const errMsg = fresh?.error || "服务器重启失败，请检查配置";
      throw new Error(errMsg);
    }
    return true;
  }

  /** 调用工具 */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ content: unknown; isError?: boolean }> {
    const start = Date.now();
    const logId = randomUUID();

    try {
      const result = await this.serverManager.callTool(serverName, toolName, args);
      const duration = Date.now() - start;

      this.persistLog({
        id: logId,
        toolName,
        serverName,
        sourceType: "mcp",
        sourceName: serverName,
        input: args,
        output: JSON.stringify(result.content).slice(0, 2000),
        status: "success",
        timestamp: start,
        duration,
      });

      return result;
    } catch (err) {
      const duration = Date.now() - start;
      this.persistLog({
        id: logId,
        toolName,
        serverName,
        sourceType: "mcp",
        sourceName: serverName,
        input: args,
        output: String(err),
        status: "error",
        timestamp: start,
        duration,
      });
      throw err;
    }
  }

  /** 获取调用日志（从 SQLite 读取） */
  getCallLogs(): ToolCallLog[] {
    return this.logManager?.getLogs(200, 0) ?? [];
  }

  /** 清除日志 */
  clearLogs(): void {
    this.logManager?.clearAll();
  }

  /** 持久化日志到 SQLite */
  private persistLog(log: ToolCallLog): void {
    this.logManager?.addLog(log);
  }

  /** 销毁 */
  async destroy(): Promise<void> {
    await this.serverManager.destroy();
  }
}
