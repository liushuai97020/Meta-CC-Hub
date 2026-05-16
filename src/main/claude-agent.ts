/**
 * Claude Agent 管理器
 * 使用 @anthropic-ai/sdk 直接调用 Anthropic Messages API
 * 本地实现 Read/Edit/Write/Bash 工具，完全跳过子进程
 */
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface AgentConfig {
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  maxTokens?: number;
  modelType?: ModelType;
  apiFormat?: "anthropic" | "openai";
  proxy?: ProxyConfig;
}

export interface AgentResponse {
  content: string;
  toolCalls?: ToolCallResult[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  status: "success" | "error";
  error?: string;
}

export interface StreamCallbacks {
  onStatus: (status: string) => void;
  onChunk: (text: string) => void;
  onToolUse: (toolName: string, input: Record<string, unknown>) => void;
  onToolResult: (toolName: string, status: string) => void;
  onError: (error: string) => void;
  onDone: (usage: { inputTokens: number; outputTokens: number }) => void;
}

const TOOLS = [
  {
    name: "Read",
    description: "读取指定文件的内容",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "要读取的文件绝对路径" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "Edit",
    description:
      "编辑文件内容（搜索替换方式）。oldString 必须在文件中唯一匹配，且包含足够的上下文确保唯一性",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "文件绝对路径" },
        oldString: {
          type: "string",
          description: "要被替换的原文（必须在文件中唯一匹配）",
        },
        newString: { type: "string", description: "替换后的新内容" },
      },
      required: ["filePath", "oldString", "newString"],
    },
  },
  {
    name: "Write",
    description: "将内容写入文件（创建新文件或覆盖已有文件）",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "文件绝对路径" },
        content: { type: "string", description: "写入的文件内容" },
      },
      required: ["filePath", "content"],
    },
  },
  {
    name: "Bash",
    description: "在 shell 中执行命令",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的 shell 命令" },
        cwd: {
          type: "string",
          description: "工作目录（可选，默认使用项目目录）",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "getCurrentTime",
    description: "获取当前日期和时间。当用户询问时间、日期时使用此工具。",
    input_schema: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "时区（可选），例如 Asia/Shanghai、America/New_York" },
      },
    },
  },
];

export class ClaudeAgentManager {
  private config: AgentConfig | null = null;
  private abortController: AbortController | null = null;
  private availableSkillsMd = "";
  private mcpClient: any = null;

  constructor() {}

  /** 设置可用技能列表 Markdown（用于 system prompt 让 agent 感知有哪些技能） */
  setAvailableSkillsMd(md: string): void {
    this.availableSkillsMd = md;
  }

  /** 注入 MCP 客户端，使 agent 可以调用 MCP 工具 */
  setMCPClient(client: any): void {
    this.mcpClient = client;
  }

  async initialize(modelConfig: ModelConfig): Promise<void> {
    this.config = this.mapModelConfig(modelConfig);
    this.abortController = null;
    console.log(
      "[ClaudeAgentManager] Initialized:",
      this.config.modelName,
      `(${this.config.modelType})`,
    );
  }

  async sendMessageStream(
    message: string,
    callbacks: StreamCallbacks,
    cwd?: string,
    history?: Array<{ role: string; content: string }>,
  ): Promise<AgentResponse> {
    if (!this.config) {
      callbacks.onError("Agent not configured");
      return {
        content: "[Not Configured]",
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    try {
      if (this.config.modelType === "local") {
        return await this.sendViaOllama(message, callbacks, history);
      }
      if (this.config.apiFormat === "openai") {
        return await this.sendViaOpenAICompatible(message, callbacks, cwd, history);
      }
      return await this.sendViaDirectAPI(message, callbacks, cwd, history);
    } catch (error: any) {
      // AbortError = 用户主动中断，不是真正的错误
      if (error?.name === 'AbortError' || (String(error).includes('abort') && String(error).includes('signal'))) {
        console.log("[ClaudeAgentManager] Stream aborted by user");
        callbacks.onDone({ inputTokens: 0, outputTokens: 0 });
        return { content: "(已中断)", usage: { inputTokens: 0, outputTokens: 0 } };
      }
      console.error("[ClaudeAgentManager] Error:", error);
      callbacks.onError(String(error));
      return {
        content: `[Error] ${error}`,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
  }

  /**
   * 通过 Anthropic Messages API（原生 fetch，不依赖 @anthropic-ai/sdk）
   * 本地实现工具，完全跳过 Claude Code 子进程
   */
  private async sendViaDirectAPI(
    message: string,
    callbacks: StreamCallbacks,
    cwd?: string,
    history?: Array<{ role: string; content: string }>,
  ): Promise<AgentResponse> {
    callbacks.onStatus(`Querying ${this.config!.modelName} via Anthropic Messages API...`);

    this.abortController = new AbortController();

    const baseUrl = (this.config!.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
    const url = `${baseUrl}/v1/messages`;
    const model = this.config!.modelName || "claude-sonnet-4-6";
    const maxTokens = this.config!.maxTokens || 8192;
    // 合并内置工具和 MCP 工具
    const mcpTools = this.mcpClient?.getAllTools() || [];
    const allTools = [
      ...TOOLS,
      ...mcpTools.map((t: any) => ({
        name: t.name,
        description: t.description || "",
        input_schema: t.inputSchema,
      })),
    ];
    const systemPrompt = this.buildSystemPrompt(model);
    const messages: any[] = [
      ...(history || []),
      { role: "user", content: message },
    ];

    let fullContent = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let iteration = 0; iteration < 20; iteration++) {
      if (iteration > 0) {
        callbacks.onStatus(`Continuing (step ${iteration + 1})...`);
      }

      const body = JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        stream: true,
        tools: allTools,
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      };
      // Anthropic 官方 API 用 x-api-key，其他兼容 API 可能用 Bearer token
      if (this.config!.apiKey) {
        headers["x-api-key"] = this.config!.apiKey;
      }

      let response: Response;
      try {
        const fetchOpts: RequestInit & { proxy?: any } = {
          method: "POST",
          headers,
          body,
          signal: this.abortController?.signal,
        };
        if (this.config?.proxy) {
          fetchOpts.proxy = {
            protocol: this.config.proxy.protocol,
            host: this.config.proxy.host,
            port: this.config.proxy.port,
            ...(this.config.proxy.username ? { auth: `${this.config.proxy.username}:${this.config.proxy.password || ""}` } : {}),
          };
        }
        response = await fetch(url, fetchOpts);
      } catch (err: any) {
        if (fullContent) break;
        throw err;
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => "(no body)");
        throw new Error(`${response.status} ${errText}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Anthropic SSE 事件解析器
      let sseBuffer = "";
      let currentEvent = "";
      let textAccumulator = "";
      const toolUseBlocks: any[] = [];
      const thinkingBlocks: any[] = [];
      let currentToolUse: any = null;
      let currentThinking: string | null = null;

      function processSseLine(line: string) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          if (!dataStr.trim()) return;
          try {
            const data = JSON.parse(dataStr);
            const eventType = data.type || currentEvent;

            switch (eventType) {
              case "message_start":
                if (data.message?.usage) {
                  totalInputTokens += data.message.usage.input_tokens || 0;
                }
                break;

              case "content_block_start":
                if (data.content_block?.type === "tool_use") {
                  currentToolUse = {
                    id: data.content_block.id,
                    name: data.content_block.name,
                    input: "",
                    parsedInput: null,
                  };
                  currentThinking = null;
                } else if (data.content_block?.type === "thinking") {
                  currentThinking = "";
                  currentToolUse = null;
                }
                break;

              case "content_block_delta":
                if (data.delta?.type === "text_delta") {
                  textAccumulator += data.delta.text;
                  callbacks.onChunk(data.delta.text);
                } else if (data.delta?.type === "input_json_delta") {
                  if (currentToolUse) {
                    currentToolUse.input += data.delta.partial_json;
                  }
                } else if (data.delta?.type === "thinking_delta") {
                  if (currentThinking !== null) {
                    currentThinking += data.delta.thinking || "";
                  }
                }
                break;

              case "content_block_stop":
                if (currentToolUse) {
                  try {
                    currentToolUse.parsedInput = JSON.parse(currentToolUse.input);
                  } catch {
                    currentToolUse.parsedInput = {};
                  }
                  toolUseBlocks.push(currentToolUse);
                  currentToolUse = null;
                } else if (currentThinking !== null) {
                  thinkingBlocks.push(currentThinking);
                  currentThinking = null;
                }
                break;

              case "message_delta":
                if (data.usage) {
                  totalOutputTokens += data.usage.output_tokens || 0;
                }
                break;
            }
          } catch {
            // skip malformed JSON
          }
        } else if (line === "") {
          currentEvent = "";
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const sseLines = sseBuffer.split("\n");
        sseBuffer = sseLines.pop() || "";

        for (const sseLine of sseLines) {
          processSseLine(sseLine);
        }
      }
      // 处理 buffer 中剩余的最后一个块
      if (sseBuffer.trim()) {
        processSseLine(sseBuffer);
      }

      fullContent += textAccumulator;

      if (toolUseBlocks.length === 0) {
        break;
      }

      // 构建 assistant 消息
      const assistantContent: any[] = [];
      for (const thinking of thinkingBlocks) {
        assistantContent.push({ type: "thinking", thinking });
      }
      if (textAccumulator) {
        assistantContent.push({ type: "text", text: textAccumulator });
      }
      for (const tool of toolUseBlocks) {
        assistantContent.push({
          type: "tool_use",
          id: tool.id,
          name: tool.name,
          input: tool.parsedInput,
        });
      }
      messages.push({ role: "assistant", content: assistantContent });

      // 执行所有工具并收集结果
      const toolResults: any[] = [];
      for (const tool of toolUseBlocks) {
        callbacks.onToolUse(tool.name, tool.parsedInput);
        try {
          const result = await this.executeTool(
            tool.name,
            tool.parsedInput,
            cwd,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content:
              typeof result === "string" ? result : JSON.stringify(result),
          });
          callbacks.onToolResult(tool.name, "success");
        } catch (err: any) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: `[Error] ${err.message}`,
            is_error: true,
          });
          callbacks.onToolResult(tool.name, "error");
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    const usage = {
      inputTokens: totalInputTokens || Math.ceil(message.length / 4),
      outputTokens: totalOutputTokens || Math.ceil(fullContent.length / 4),
    };
    callbacks.onDone(usage);
    return { content: fullContent || "(no content)", usage };
  }

  /**
   * 本地执行工具
   */
  private async executeTool(
    name: string,
    input: any,
    cwd?: string,
  ): Promise<string> {
    switch (name) {
      case "Read": {
        const content = await fs.readFile(input.filePath, "utf-8");
        return content;
      }

      case "Edit": {
        const { filePath, oldString, newString } = input;
        const current = await fs.readFile(filePath, "utf-8");
        // 确保 oldString 唯一匹配
        const firstIndex = current.indexOf(oldString);
        if (firstIndex === -1) {
          throw new Error(`未找到匹配内容，请检查 oldString 是否准确`);
        }
        const lastIndex = current.lastIndexOf(oldString);
        if (firstIndex !== lastIndex) {
          throw new Error(
            `oldString 在文件中出现多次，请提供更多上下文以确保唯一匹配`,
          );
        }
        const updated =
          current.slice(0, firstIndex) +
          newString +
          current.slice(firstIndex + oldString.length);
        await fs.writeFile(filePath, updated, "utf-8");
        return `已修改 ${filePath}`;
      }

      case "Write": {
        const { filePath, content } = input;
        await fs.writeFile(filePath, content, "utf-8");
        return `已写入 ${filePath}`;
      }

      case "Bash": {
        const cmd = input.command;
        try {
          const { stdout } = await execAsync(cmd, {
            encoding: "utf-8",
            maxBuffer: 10 * 1024 * 1024,
            cwd,
            timeout: 30000,
          });
          return stdout || "(empty output)";
        } catch (e: any) {
          return `执行失败: ${e.stderr || e.message || String(e)}`;
        }
      }

      case "getCurrentTime": {
        const now = new Date();
        const tz = input.timezone || undefined;
        try {
          const timeStr = now.toLocaleString("zh-CN", { timeZone: tz });
          return `当前时间: ${timeStr}${tz ? ` (时区: ${tz})` : ""}`;
        } catch {
          return `当前时间: ${now.toLocaleString("zh-CN")}`;
        }
      }

      default:
        if (this.mcpClient) {
          const allMCP = this.mcpClient.getAllTools();
          const tool = allMCP.find((t: any) => t.name === name);
          if (tool) {
            const result = await this.mcpClient.callTool(tool.serverName, name, input);
            return typeof result.content === "string"
              ? result.content
              : JSON.stringify(result.content);
          }
        }
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * 根据模型名称构建正确的 system prompt
   * - Claude 模型：依赖原生 tool_use API
   * - 非 Claude 模型：使用 XML 标签格式让模型表达工具调用意图
   */
  private buildSystemPrompt(modelName: string): string {
    const isClaude = modelName.toLowerCase().includes("claude");
    const isLocal = this.config?.modelType === "local";

    const parts: string[] = [];

    if (isClaude) {
      parts.push("You are Claude, an AI assistant built by Anthropic.");
    } else {
      parts.push("You are a helpful AI assistant named MetaCode, integrated into a cross-platform desktop AI programming assistant.");
    }

    parts.push("");

    // ===== 工具定义（内置工具 + MCP 工具） =====
    parts.push("=== AVAILABLE TOOLS (you MUST use them when needed) ===");
    parts.push("");
    parts.push("【内置工具】");
    parts.push("- Read: 读取文件内容。参数: filePath");
    parts.push("- Edit: 编辑文件（搜索替换）。参数: filePath, oldString, newString");
    parts.push("- Write: 写入文件。参数: filePath, content");
    parts.push("- Bash: 执行 shell 命令。参数: command, cwd(可选)");
    parts.push("- getCurrentTime: 获取当前日期和时间。参数: timezone(可选)");
    parts.push("");

    // 动态注入 MCP 工具列表
    const mcpTools = this.mcpClient?.getAllTools() || [];
    if (mcpTools.length > 0) {
      parts.push("【MCP 外部工具（联网、搜索等）】");
      for (const t of mcpTools) {
        const desc = t.description || "无描述";
        const params = t.inputSchema?.properties
          ? Object.keys(t.inputSchema.properties as Record<string, unknown>).join(", ")
          : "无参数";
        parts.push(`- ${t.name}（来自 ${t.serverName}）: ${desc}。参数: ${params}`);
      }
      parts.push("");
    }

    // ===== 强制工具使用规则 =====
    if (!isClaude) {
      parts.push("=== CRITICAL RULES FOR TOOL USE ===");
      parts.push("1. When user asks about time, date, or any real-time info → you MUST call getCurrentTime.");
      parts.push("2. When user asks to read/edit/write files → you MUST call Read/Edit/Write.");
      parts.push("3. When user asks to search the web, fetch a URL, get online info → you MUST use MCP tools like fetch.");
      parts.push("4. NEVER tell the user to check something themselves. Use the appropriate tool instead.");
      parts.push("");

      if (!isLocal) {
        parts.push("You have been given a set of functions/tools. When you need to use a tool, respond with a function call using the available functions. The system will execute the function and return the result.");
        parts.push("");
      } else {
        parts.push("=== YOU MUST OUTPUT TOOL CALLS IN THIS EXACT XML FORMAT ===");
        parts.push("When you need to use a tool, include the XML tag in your response:");
        parts.push("");
        parts.push('<tool name="getCurrentTime">');
        parts.push("<timezone>Asia/Shanghai</timezone>");
        parts.push("</tool>");
        parts.push("");
        parts.push("IMPORTANT: The XML tool tag will be extracted and executed automatically.");
        parts.push("After getting the result, continue your response naturally.");
        parts.push("");
      }
    } else {
      parts.push("When the user asks for the time, use getCurrentTime. Read/edit/write files using the corresponding tools.");
    }

    parts.push("");

    // ===== 标注模式 =====
    parts.push("=== Annotation mode (only when user sends element annotations) ===");
    parts.push("1. Read the file using Read (NOT Bash).");
    parts.push("2. Apply changes using Edit or Write. Preserve the HTML tag name.");
    parts.push("3. State the result briefly.");
    parts.push("");

    if (this.availableSkillsMd) {
      parts.push("=== Available Skills ===");
      parts.push(this.availableSkillsMd);
    }

    return parts.join("\n");
  }

  /**
   * 从文本中解析 XML 格式的工具调用
   * 格式: <tool name="toolName"><param>value</param></tool>
   * 用于不支持原生 function calling 的模型
   */
  private parseXmlToolCalls(text: string): Array<{ name: string; args: Record<string, string> }> {
    const calls: Array<{ name: string; args: Record<string, string> }> = [];
    const regex = /<tool\s+name=["']([^"']+)["']>([\s\S]*?)<\/tool>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const name = match[1];
      const body = match[2];
      const args: Record<string, string> = {};
      const argRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
      let argMatch: RegExpExecArray | null;
      while ((argMatch = argRegex.exec(body)) !== null) {
        args[argMatch[1]] = argMatch[2].trim();
      }
      calls.push({ name, args });
    }
    return calls;
  }

  // ======================
  // OpenAI 兼容 API（third-party / custom）
  // ======================

  private async sendViaOpenAICompatible(
    message: string,
    callbacks: StreamCallbacks,
    cwd?: string,
    history?: Array<{ role: string; content: string }>,
  ): Promise<AgentResponse> {
    let baseUrl = (this.config!.baseUrl || "").replace(/\/+$/, "");
    const chatEndpoint = baseUrl.endsWith("/v1")
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;
    const model = this.config!.modelName || "deepseek-chat";
    const maxTokens = this.config!.maxTokens || 8192;
    const systemPrompt = this.buildSystemPrompt(model);
    callbacks.onStatus(`Querying ${model} via OpenAI-compatible API...`);

    this.abortController = new AbortController();

    // 构建 tools（OpenAI function calling 格式）
    const mcpTools = this.mcpClient?.getAllTools() || [];
    const allToolDefs = [
      ...TOOLS,
      ...mcpTools.map((t: any) => ({
        name: t.name,
        description: t.description || "",
        input_schema: t.inputSchema,
      })),
    ];
    const openaiTools = allToolDefs.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...(history || []),
      { role: "user", content: message },
    ];

    let fullContent = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let iteration = 0; iteration < 20; iteration++) {
      if (iteration > 0) {
        callbacks.onStatus(`继续 (第 ${iteration + 1} 步)...`);
      }

      const body = JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: true,
        tools: openaiTools,
        tool_choice: "auto",
      });

      const response = await this.fetchWithRetry(chatEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config!.apiKey || ""}`,
        },
        body,
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "(no body)");
        throw new Error(`${response.status} ${errText}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let textAccumulator = "";
      let reasoningAccumulator = "";
      const tcAcc: Map<number, { id: string; name: string; args: string }> = new Map();
      let hasToolCalls = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            if (parsed.usage) {
              totalInputTokens = parsed.usage.prompt_tokens || 0;
              totalOutputTokens = parsed.usage.completion_tokens || 0;
            }
            const delta = choice?.delta;
            if (delta?.content) {
              textAccumulator += delta.content;
              callbacks.onChunk(delta.content);
            }
            // DeepSeek 思考链内容（reasoning_content 必须保留在上下文中）
            if (delta?.reasoning_content) {
              reasoningAccumulator += delta.reasoning_content;
            }
            if (delta?.tool_calls) {
              hasToolCalls = true;
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!tcAcc.has(idx)) tcAcc.set(idx, { id: "", name: "", args: "" });
                const entry = tcAcc.get(idx)!;
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) entry.name = tc.function.name;
                if (tc.function?.arguments) entry.args += tc.function.arguments;
              }
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      fullContent += textAccumulator;

      // === priority 1: native tool_calls ===
      if (hasToolCalls && tcAcc.size > 0) {
        const sortedCalls = Array.from(tcAcc.entries())
          .sort(([a], [b]) => a - b)
          .map(([_, tc]) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.args },
          }));
        for (const c of sortedCalls) {
          try { c.function.arguments = JSON.stringify(JSON.parse(c.function.arguments)); } catch { /* keep raw */ }
        }
        const assistantMsg: any = { role: "assistant", content: textAccumulator || null, tool_calls: sortedCalls };
        // DeepSeek 要求保留 reasoning_content
        if (reasoningAccumulator) {
          assistantMsg.reasoning_content = reasoningAccumulator;
        }
        messages.push(assistantMsg);
        for (const c of sortedCalls) {
          let args: any = {};
          try { args = JSON.parse(c.function.arguments); } catch { args = {}; }
          callbacks.onToolUse(c.function.name, args);
          try {
            const result = await this.executeTool(c.function.name, args, cwd);
            messages.push({ role: "tool", tool_call_id: c.id, content: typeof result === "string" ? result : JSON.stringify(result) });
            callbacks.onToolResult(c.function.name, "success");
          } catch (err: any) {
            messages.push({ role: "tool", tool_call_id: c.id, content: `[Error] ${err.message}`, is_error: true });
            callbacks.onToolResult(c.function.name, "error");
          }
        }
        continue;
      }

      // === priority 2: XML-style tool calls ===
      const xmlCalls = this.parseXmlToolCalls(textAccumulator);
      if (xmlCalls.length > 0) {
        const cleanContent = textAccumulator.replace(/<tool[\s\S]*?<\/tool>/g, "").trim();
        const assistantMsg: any = { role: "assistant", content: cleanContent || null };
        if (reasoningAccumulator) {
          assistantMsg.reasoning_content = reasoningAccumulator;
        }
        messages.push(assistantMsg);
        for (const xc of xmlCalls) {
          callbacks.onToolUse(xc.name, xc.args);
          try {
            const result = await this.executeTool(xc.name, xc.args, cwd);
            messages.push({ role: "user", content: `工具 "${xc.name}" 返回: ${typeof result === "string" ? result.slice(0, 2000) : JSON.stringify(result).slice(0, 2000)}` });
            callbacks.onToolResult(xc.name, "success");
          } catch (err: any) {
            messages.push({ role: "user", content: `工具 "${xc.name}" 执行失败: ${err.message}` });
            callbacks.onToolResult(xc.name, "error");
          }
        }
        continue;
      }

      // === no tool calls -> done ===
      break;
    }

    const usage = {
      inputTokens: totalInputTokens || Math.ceil(message.length / 4),
      outputTokens: totalOutputTokens || Math.ceil(fullContent.length / 4),
    };
    callbacks.onDone(usage);
    return { content: fullContent || "(no content)", usage };
  }

  // ======================
  // Ollama（local）— 使用 OpenAI 兼容格式支持工具调用
  // ======================

  private async sendViaOllama(
    message: string,
    callbacks: StreamCallbacks,
    history?: Array<{ role: string; content: string }>,
  ): Promise<AgentResponse> {
    const baseUrl = (this.config!.baseUrl || "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    // Ollama 支持 /v1/chat/completions (OpenAI 兼容)
    const url = `${baseUrl}/v1/chat/completions`;
    const model = this.config!.modelName || "qwen2.5";
    const maxTokens = this.config!.maxTokens || 4096;
    const systemPrompt = this.buildSystemPrompt(model);

    callbacks.onStatus(`Calling Ollama ${model}...`);

    this.abortController = new AbortController();

    // 构建工具列表（OpenAI 格式）
    const mcpTools = this.mcpClient?.getAllTools() || [];
    const allToolDefs = [
      ...TOOLS,
      ...mcpTools.map((t: any) => ({
        name: t.name,
        description: t.description || "",
        input_schema: t.inputSchema,
      })),
    ];
    const openaiTools = allToolDefs.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...(history || []),
      { role: "user", content: message },
    ];

    let fullContent = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let iteration = 0; iteration < 20; iteration++) {
      if (iteration > 0) {
        callbacks.onStatus(`继续 (第 ${iteration + 1} 步)...`);
      }

      const body = JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: true,
        tools: openaiTools,
        tool_choice: "auto",
      });

      const response = await this.fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "(no body)");
        throw new Error(`Ollama ${response.status} ${errText}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let textAccumulator = "";
      let reasoningAccumulator = "";
      const tcAcc: Map<number, { id: string; name: string; args: string }> = new Map();
      let hasToolCalls = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            if (parsed.usage) {
              totalInputTokens = parsed.usage.prompt_tokens || totalInputTokens;
              totalOutputTokens = parsed.usage.completion_tokens || totalOutputTokens;
            }
            const delta = choice?.delta;
            if (delta?.content) {
              textAccumulator += delta.content;
              callbacks.onChunk(delta.content);
            }
            if (delta?.reasoning_content) {
              reasoningAccumulator += delta.reasoning_content;
            }
            if (delta?.tool_calls) {
              hasToolCalls = true;
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!tcAcc.has(idx)) tcAcc.set(idx, { id: "", name: "", args: "" });
                const entry = tcAcc.get(idx)!;
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) entry.name = tc.function.name;
                if (tc.function?.arguments) entry.args += tc.function.arguments;
              }
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      fullContent += textAccumulator;

      // priority 1: native tool_calls
      if (hasToolCalls && tcAcc.size > 0) {
        const sortedCalls = Array.from(tcAcc.entries())
          .sort(([a], [b]) => a - b)
          .map(([_, tc]) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.args },
          }));
        for (const c of sortedCalls) {
          try { c.function.arguments = JSON.stringify(JSON.parse(c.function.arguments)); } catch { /* keep raw */ }
        }
        const assistantMsg: any = { role: "assistant", content: textAccumulator || null, tool_calls: sortedCalls };
        if (reasoningAccumulator) {
          assistantMsg.reasoning_content = reasoningAccumulator;
        }
        messages.push(assistantMsg);
        for (const c of sortedCalls) {
          let args: any = {};
          try { args = JSON.parse(c.function.arguments); } catch { args = {}; }
          callbacks.onToolUse(c.function.name, args);
          try {
            const result = await this.executeTool(c.function.name, args);
            messages.push({ role: "tool", tool_call_id: c.id, content: typeof result === "string" ? result : JSON.stringify(result) });
            callbacks.onToolResult(c.function.name, "success");
          } catch (err: any) {
            messages.push({ role: "tool", tool_call_id: c.id, content: `[Error] ${err.message}`, is_error: true });
            callbacks.onToolResult(c.function.name, "error");
          }
        }
        continue;
      }

      // priority 2: XML fallback
      const xmlCalls = this.parseXmlToolCalls(textAccumulator);
      if (xmlCalls.length > 0) {
        const cleanContent = textAccumulator.replace(/<tool[\s\S]*?<\/tool>/g, "").trim();
        const assistantMsg: any = { role: "assistant", content: cleanContent || null };
        if (reasoningAccumulator) {
          assistantMsg.reasoning_content = reasoningAccumulator;
        }
        messages.push(assistantMsg);
        for (const xc of xmlCalls) {
          callbacks.onToolUse(xc.name, xc.args);
          try {
            const result = await this.executeTool(xc.name, xc.args);
            messages.push({ role: "user", content: `工具 "${xc.name}" 返回: ${typeof result === "string" ? result.slice(0, 2000) : JSON.stringify(result).slice(0, 2000)}` });
            callbacks.onToolResult(xc.name, "success");
          } catch (err: any) {
            messages.push({ role: "user", content: `工具 "${xc.name}" 执行失败: ${err.message}` });
            callbacks.onToolResult(xc.name, "error");
          }
        }
        continue;
      }

      break;
    }

    const usage = {
      inputTokens: totalInputTokens || Math.ceil(message.length / 4),
      outputTokens: totalOutputTokens || Math.ceil(fullContent.length / 4),
    };
    callbacks.onDone(usage);
    return { content: fullContent || "(no content)", usage };
  }

  // ======================
  // 非流式（兼容旧调用方）
  // ======================

  async sendMessage(message: string): Promise<AgentResponse> {
    const noopCallbacks: StreamCallbacks = {
      onStatus: () => {},
      onChunk: () => {},
      onToolUse: () => {},
      onToolResult: () => {},
      onError: () => {},
      onDone: () => {},
    };

    if (this.config?.modelType === "local") {
      return await this.sendViaOllama(message, noopCallbacks);
    }
    if (this.config?.apiFormat === "openai") {
      return await this.sendViaOpenAICompatible(message, noopCallbacks);
    }
    return await this.sendViaDirectAPI(message, noopCallbacks);
  }

  // ======================
  // 生命周期
  // ======================

  async switchModel(modelConfig: ModelConfig): Promise<void> {
    await this.abort();
    this.config = this.mapModelConfig(modelConfig);
  }

  async abort(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
  }

  async cleanup(): Promise<void> {
    await this.abort();
  }

  async dispose(): Promise<void> {
    await this.cleanup();
    this.config = null;
  }

  private mapModelConfig(modelConfig: ModelConfig): AgentConfig {
    return {
      apiKey: modelConfig.apiKey,
      baseUrl: modelConfig.baseUrl,
      modelName: modelConfig.modelName,
      maxTokens: modelConfig.maxTokens,
      modelType: modelConfig.type,
      apiFormat: modelConfig.apiFormat,
      proxy: modelConfig.proxy,
    };
  }

  /** 带重试的 fetch（处理网络瞬时错误，如 socket close/reset） */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3,
  ): Promise<Response> {
    // 应用代理配置
    const fetchOptions: RequestInit & { proxy?: any } = { ...options };
    if (this.config?.proxy && !(fetchOptions as any).proxy) {
      (fetchOptions as any).proxy = {
        protocol: this.config.proxy.protocol,
        host: this.config.proxy.host,
        port: this.config.proxy.port,
        ...(this.config.proxy.username ? { auth: `${this.config.proxy.username}:${this.config.proxy.password || ""}` } : {}),
      };
    }
    let lastErr: Error | null = null;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fetch(url, fetchOptions);
      } catch (err: any) {
        lastErr = err;
        // 仅对网络层错误重试（socket close、reset、timeout 等），HTTP 错误不重试
        const isNetworkError =
          err?.cause?.code === "UND_ERR_SOCKET" ||
          err?.cause?.code === "ECONNRESET" ||
          err?.cause?.code === "ETIMEDOUT" ||
          err?.cause?.code === "UND_ERR_CONNECT_TIMEOUT" ||
          err?.code === "UND_ERR_SOCKET" ||
          err?.code === "ECONNRESET" ||
          err?.code === "ETIMEDOUT";
        if (!isNetworkError || i === maxRetries) break;
        const delay = Math.min(1000 * 2 ** i, 8000);
        console.log(
          `[ClaudeAgentManager] fetch 网络错误，${delay}ms 后重试 (${i + 1}/${maxRetries}):`,
          err.message,
        );
        if (this.abortController?.signal.aborted) break;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  getConfig(): AgentConfig | null {
    return this.config;
  }
}
