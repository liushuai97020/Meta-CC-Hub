/**
 * Agent 引擎
 * 多轮工具调用引擎，基于 MCP 工具列表与 LLM 交互
 */

import type { MCPClient } from "./mcp/client";
import type { AgentConfig, AgentCallbacks } from "./types";
import { DEFAULT_AGENT_CONFIG } from "./types";

interface Session {
  id: string;
  history: Array<{ role: string; content: string }>;
  aborted: boolean;
}

export class AgentEngine {
  private config: AgentConfig;
  private sessions: Map<string, Session> = new Map();
  private currentSessionId: string | null = null;
  private mcpClient: MCPClient;

  constructor(mcpClient: MCPClient, config?: Partial<AgentConfig>) {
    this.mcpClient = mcpClient;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  /** 获取配置 */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /** 更新配置 */
  updateConfig(partial: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /** 获取状态 */
  getStatus(): string {
    return this.currentSessionId ? "running" : "idle";
  }

  /** 发送消息（主入口） */
  async sendMessage(
    message: string,
    callbacks: AgentCallbacks,
    history?: Array<{ role: string; content: string }>,
  ): Promise<unknown> {
    if (!this.config.enabled) {
      throw new Error("Agent 未启用");
    }

    const sessionId = `session-${Date.now()}`;
    const session: Session = {
      id: sessionId,
      history: [
        ...(history || []),
        { role: "user", content: message },
      ],
      aborted: false,
    };

    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;
    callbacks.onStatus("thinking");

    try {
      const result = await this.runWithTools(session, callbacks);
      callbacks.onDone({ inputTokens: 0, outputTokens: 0 });
      return result;
    } catch (err) {
      callbacks.onError(String(err));
      throw err;
    } finally {
      this.currentSessionId = null;
    }
  }

  /** 多轮工具调用 */
  private async runWithTools(
    session: Session,
    callbacks: AgentCallbacks,
  ): Promise<unknown> {
    const tools = this.mcpClient.getAllTools();
    const maxIter = this.config.maxIterations;

    // 获取 LLM 回复（模拟模式，实际项目会调用真实 API）
    const response = await this.getLLMResponse(
      session.history,
      tools.map((t) => ({
        name: t.name,
        description: t.description || "",
        input_schema: t.inputSchema,
      })),
    );

    session.history.push({ role: "assistant", content: response });

    // 解析工具调用
    const toolCalls = this.parseToolCalls(response);

    if (toolCalls.length === 0) {
      // 没有工具调用，返回最终回复
      callbacks.onChunk(response);
      return response;
    }

    // 执行工具调用
    for (let i = 0; i < Math.min(toolCalls.length, maxIter); i++) {
      const tc = toolCalls[i];

      // 检查是否需要用户确认
      if (this.config.confirmEachTool) {
        // 在需要确认时，通过 status 回调通知 UI
        callbacks.onStatus(`confirm:${tc.name}`);
      }

      callbacks.onToolStart(tc.name, tc.args);

      try {
        // 查找工具所在服务器
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) {
          throw new Error(`工具 "${tc.name}" 不存在`);
        }

        const result = await this.mcpClient.callTool(
          tool.serverName,
          tc.name,
          tc.args,
        );

        const outputStr = JSON.stringify(result.content);
        callbacks.onToolEnd(tc.name, outputStr, "success");

        // 将工具调用结果加入历史
        session.history.push({
          role: "user",
          content: `工具 "${tc.name}" 返回: ${outputStr.slice(0, 2000)}`,
        });

        // 获取下一步 LLM 回复
        callbacks.onStatus("thinking");
        const nextResponse = await this.getLLMResponse(
          session.history,
          tools.map((t) => ({
            name: t.name,
            description: t.description || "",
            input_schema: t.inputSchema,
          })),
        );

        session.history.push({ role: "assistant", content: nextResponse });
        callbacks.onChunk(nextResponse);

        // 检查是否还有更多工具调用
        const nextCalls = this.parseToolCalls(nextResponse);
        if (nextCalls.length === 0) break;
      } catch (err) {
        callbacks.onToolEnd(tc.name, String(err), "error");
        session.history.push({
          role: "user",
          content: `工具 "${tc.name}" 执行失败: ${String(err)}`,
        });
      }

      if (session.aborted) break;
    }

    return session.history[session.history.length - 1].content;
  }

  /** 获取 LLM 回复（框架占位，实际需要集成真实 API） */
  private async getLLMResponse(
    history: Array<{ role: string; content: string }>,
    tools: Array<{ name: string; description: string; input_schema: unknown }>,
  ): Promise<string> {
    // ==============================================
    // 此方法应被重写以调用真实 LLM API
    // 当前返回模拟响应以保持编译通过
    //
    // 可集成的 API：
    // - Anthropic SDK (@anthropic-ai/sdk)
    // - OpenAI SDK (openai)
    // - 自定义 API
    // ==============================================

    const lastMsg = history[history.length - 1]?.content || "";
    const toolNames = tools.map((t) => t.name).join(", ");

    return `[模拟回复] 收到消息: "${lastMsg.slice(0, 50)}..."\n可用工具: ${toolNames}\n\n请集成真实的 LLM API 以获得完整功能。`;
  }

  /** 从 LLM 回复中解析工具调用 */
  private parseToolCalls(
    response: string,
  ): Array<{ name: string; args: Record<string, unknown> }> {
    // 简单解析 XML 风格的工具调用标签
    // 例如: <tool name="read_file"><path>xxx</path></tool>
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const regex = /<tool\s+name=["']([^"']+)["']>([\s\S]*?)<\/tool>/g;
    let match;

    while ((match = regex.exec(response)) !== null) {
      const name = match[1];
      const body = match[2];
      const args: Record<string, unknown> = {};

      // 解析子标签作为参数
      const argRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
      let argMatch;
      while ((argMatch = argRegex.exec(body)) !== null) {
        args[argMatch[1]] = argMatch[2].trim();
      }

      calls.push({ name, args });
    }

    return calls;
  }

  /** 中止当前会话 */
  abort(): void {
    if (this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session) {
        session.aborted = true;
      }
    }
  }
}
