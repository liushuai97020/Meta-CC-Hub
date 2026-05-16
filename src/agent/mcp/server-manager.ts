/**
 * MCP 服务器进程管理器
 * 管理 MCP 服务器进程的生命周期：启动、停止、重启
 * 支持三种传输协议：stdio / SSE / Streamable HTTP
 */

import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { MCPServerConfig, MCPServerInstance, MCPServerStatus, MCPToolMeta } from "../types";

/** 运行中的 MCP 服务器实例 */
interface RunningServer {
  name: string;
  config: MCPServerConfig;
  client: Client;
  transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
  tools: MCPToolMeta[];
  status: MCPServerStatus;
  error?: string;
  cleanup: () => void;
}

export class MCPServerManager {
  private servers: Map<string, RunningServer> = new Map();
  private onStatusChange?: (name: string, status: MCPServerStatus) => void;

  constructor(onStatusChange?: (name: string, status: MCPServerStatus) => void) {
    this.onStatusChange = onStatusChange;
  }

  /** 获取所有服务器实例信息 */
  getAllInstances(): MCPServerInstance[] {
    const instances: MCPServerInstance[] = [];
    for (const [name, server] of this.servers) {
      instances.push({
        name,
        config: server.config,
        status: server.status,
        error: server.error,
        tools: server.tools,
      });
    }
    return instances;
  }

  /** 获取单个服务器实例 */
  getInstance(name: string): MCPServerInstance | undefined {
    const server = this.servers.get(name);
    if (!server) return undefined;
    return {
      name,
      config: server.config,
      status: server.status,
      error: server.error,
      tools: server.tools,
    };
  }

  /** 获取所有服务器的工具列表 */
  getAllTools(): MCPToolMeta[] {
    const allTools: MCPToolMeta[] = [];
    for (const [, server] of this.servers) {
      if (server.status === "running") {
        allTools.push(...server.tools);
      }
    }
    return allTools;
  }

  /** 根据配置创建对应的 Transport */
  private createTransport(
    config: MCPServerConfig,
  ): StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport {
    const transportType = config.type || "stdio";

    if (transportType === "sse") {
      if (!config.url) throw new Error("SSE 传输需要提供 url");

      return new SSEClientTransport(new URL(config.url), {
        requestInit: config.headers
          ? { headers: config.headers }
          : undefined,
      });
    }

    if (transportType === "http") {
      if (!config.url) throw new Error("HTTP 传输需要提供 url");

      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: config.headers
          ? { headers: config.headers }
          : undefined,
      });
    }

    // 默认 stdio
    if (!config.command) throw new Error("stdio 传输需要提供 command");

    return new StdioClientTransport({
      command: config.command!,
      args: config.args,
      env: config.env,
      cwd: config.cwd,
      stderr: "pipe",
    });
  }

  /** 启动单个 MCP 服务器 */
  async startServer(name: string, config: MCPServerConfig): Promise<boolean> {
    if (this.servers.has(name)) {
      await this.stopServer(name);
    }

    const client = new Client(
      { name: "MetaCode", version: "1.0.0" },
      { capabilities: {} },
    );

    let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
    try {
      transport = this.createTransport(config);
    } catch (err) {
      console.error(`[MCPServer] "${name}" 创建传输失败:`, String(err));
      this.emitStatus(name, "error");
      return false;
    }

    const server: RunningServer = {
      name,
      config,
      client,
      transport,
      tools: [],
      status: "starting",
      cleanup: () => {
        transport.close().catch(() => {});
      },
    };

    this.servers.set(name, server);
    this.emitStatus(name, "starting");

    // stdio 传输单独捕获 stderr（Windows 兼容 GBK 编码）
    const stderrChunks: Buffer[] = [];
    if (transport instanceof StdioClientTransport) {
      transport.stderr?.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });
    }

    try {
      await client.connect(transport);

      const serverInfo = client.getServerVersion();
      const serverCaps = client.getServerCapabilities();
      console.log(`[MCPServer] "${name}" 已连接 (${config.type || "stdio"}):`, {
        serverInfo,
        capabilities: serverCaps ? Object.keys(serverCaps) : [],
      });

      // 列出可用工具
      let tools: MCPToolMeta[] = [];
      try {
        const result = await client.listTools();
        tools = (result.tools || []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown>,
          serverName: name,
        }));
        console.log(`[MCPServer] "${name}" 加载了 ${tools.length} 个工具`);
      } catch (err) {
        console.warn(`[MCPServer] "${name}" listTools 失败:`, err);
      }

      server.tools = tools;
      server.status = "running";
      this.emitStatus(name, "running");
      return true;
    } catch (err) {
      // 解码 stderr 缓冲区（Windows GBK → UTF-8）
      let stderrText = "";
      if (stderrChunks.length > 0) {
        const iconv = require("iconv-lite");
        for (const chunk of stderrChunks) {
          try {
            // 尝试 GBK → UTF-8 解码（Windows 中文系统默认）
            stderrText += iconv.decode(chunk, "gbk");
          } catch {
            stderrText += chunk.toString("utf-8");
          }
        }
        console.error(`[MCPServer] "${name}" stderr:`, stderrText);
      }

      // 提取有意义的报错信息
      const cleanErr = stderrText.trim() || String(err);
      console.error(`[MCPServer] "${name}" 启动失败:`, cleanErr);

      server.status = "error";
      server.error = cleanErr.slice(0, 500);

      this.servers.delete(name);
      this.emitStatus(name, "error");
      return false;
    }
  }

  /** 启动所有已配置的 MCP 服务器 */
  async startAll(servers: Record<string, MCPServerConfig>): Promise<void> {
    const entries = Object.entries(servers).filter(
      ([, config]) => !config.disabled && config.autoStart !== false,
    );

    if (entries.length === 0) return;

    console.log(`[MCPServer] 开始启动 ${entries.length} 个 MCP 服务器...`);

    await Promise.allSettled(
      entries.map(([name, config]) => this.startServer(name, config)),
    );

    const running = this.getRunningCount();
    const total = entries.length;
    console.log(`[MCPServer] ${running}/${total} 服务器运行中`);
  }

  /** 停止单个服务器 */
  async stopServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) return;

    try {
      await server.client.close();
    } catch (err) {
      console.warn(`[MCPServer] "${name}" 关闭异常:`, err);
    }

    server.cleanup();
    this.servers.delete(name);
    this.emitStatus(name, "stopped");
  }

  /** 停止所有服务器 */
  async stopAll(): Promise<void> {
    const names = Array.from(this.servers.keys());
    await Promise.allSettled(names.map((name) => this.stopServer(name)));
  }

  /** 重启单个服务器 */
  async restartServer(name: string, config?: MCPServerConfig): Promise<boolean> {
    const current = this.servers.get(name);
    const finalConfig = config || current?.config;
    if (!finalConfig) return false;

    await this.stopServer(name);
    return this.startServer(name, finalConfig);
  }

  /** 检查服务器是否运行中 */
  isRunning(name: string): boolean {
    return this.servers.get(name)?.status === "running";
  }

  /** 获取运行中的服务器数量 */
  getRunningCount(): number {
    let count = 0;
    for (const [, server] of this.servers) {
      if (server.status === "running") count++;
    }
    return count;
  }

  /** 获取服务器总数 */
  getTotalCount(): number {
    return this.servers.size;
  }

  /** 调用指定服务器的工具 */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: unknown; isError?: boolean }> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== "running") {
      throw new Error(`服务器 "${serverName}" 未运行`);
    }

    const result = await server.client.callTool({
      name: toolName,
      arguments: args,
    });

    if ("toolResult" in result) {
      return { content: result.toolResult };
    }

    return {
      content: result.content,
      isError: result.isError,
    };
  }

  private emitStatus(name: string, status: MCPServerStatus): void {
    this.onStatusChange?.(name, status);
  }

  /** 销毁所有连接 */
  async destroy(): Promise<void> {
    await this.stopAll();
  }
}
