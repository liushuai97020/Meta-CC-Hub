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
];

export class ClaudeAgentManager {
  private config: AgentConfig | null = null;
  private abortController: AbortController | null = null;

  constructor() {}

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
        tools: TOOLS,
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
        response = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: this.abortController?.signal,
        });
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

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * 根据模型名称构建正确的 system prompt，避免模型错误自称为 Claude
   */
  private buildSystemPrompt(modelName: string): string {
    const isClaude = modelName.toLowerCase().includes("claude");
    const identity = isClaude
      ? "You are Claude, an AI assistant built by Anthropic."
      : "You are a helpful AI assistant integrated into MetaCode, a cross-platform desktop AI programming assistant.";

    return [
      identity,
      "You are integrated into MetaCode, a cross-platform desktop AI programming assistant.",
      "You have access to the following tools: Read, Edit, Write, Bash.",
      "",
      "When the user sends annotation modification requests, they will include file paths and line numbers. Follow these rules strictly:",
      "1. Read the specified file using the Read tool (NOT Bash - never use cat/echo or other shell commands to read files).",
      "2. The annotation shows the element structure with `...` to elide content. Read the actual file to see the real source code.",
      "3. Apply the requested changes using Edit or Write tool. The user's instruction is about modifying the element's (text content, attributes, or styling) — NOT replacing the entire HTML block or changing the HTML tag name.",
      "   CRITICAL: Preserve the element's tag name (e.g., <div>, <span>, <p>). Never change the tag name unless the user explicitly says so. '改为X' means change the text content to X, not change the tag to X.",
      "4. Output ONLY the modification result in plain text. Example format:",
      "   '已修改文件 X: 将 Y 改为 Z'",
      "   Do NOT output: tool names (Read/Edit/Write/Bash), emojis/icons, code blocks, or intermediate steps.",
      "   Do NOT say '已读取文件' or '正在读取' - just state the change itself.",
      "   Do NOT ask for confirmation - the user has already reviewed the annotations.",
      "5. Use Bash ONLY when explicitly needed (e.g., installing packages, running build commands).",
      "   Do NOT use Bash to read, write, or edit files.",
      "",
      "CRITICAL: Do NOT include tool names, emojis, or step-by-step descriptions in your response.",
      "Only output the final result of your work in natural language, nothing else.",
    ].join("\n");
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
    // 避免重复 /v1，如果 baseUrl 已是 /v1 则不再追加
    const chatEndpoint = baseUrl.endsWith("/v1")
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;
    const model = this.config!.modelName || "deepseek-chat";
    const maxTokens = this.config!.maxTokens || 8192;
    const systemPrompt = this.buildSystemPrompt(model);
    callbacks.onStatus(`Querying ${model} via OpenAI-compatible API...`);

    this.abortController = new AbortController();

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
        callbacks.onStatus(`Continuing (step ${iteration + 1})...`);
      }

      const body = JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: true,
      });

      const response = await fetch(chatEndpoint, {
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
            const delta = choice?.delta?.content;
            if (delta) {
              textAccumulator += delta;
              callbacks.onChunk(delta);
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      fullContent += textAccumulator;
      // OpenAI 兼容 API 暂不支持工具调用，一次迭代后直接结束
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
  // Ollama（local）
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
    const url = `${baseUrl}/api/chat`;

    callbacks.onStatus(`Calling Ollama ${this.config!.modelName}...`);

    const body = JSON.stringify({
      model: this.config!.modelName,
      messages: [
        ...(history || []),
        { role: "user", content: message },
      ],
      stream: true,
      options: { num_predict: this.config!.maxTokens || 2048 },
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!response.ok) {
      throw new Error(`Ollama ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            fullContent += parsed.message.content;
            callbacks.onChunk(parsed.message.content);
          }
          if (parsed.done) {
            totalInputTokens = parsed.prompt_eval_count || 0;
            totalOutputTokens = parsed.eval_count || 0;
            callbacks.onStatus("Complete");
            callbacks.onDone({
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            });
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    return {
      content: fullContent || "(no content)",
      usage: {
        inputTokens: totalInputTokens || Math.ceil(message.length / 4),
        outputTokens: totalOutputTokens || Math.ceil(fullContent.length / 4),
      },
    };
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
    };
  }

  getConfig(): AgentConfig | null {
    return this.config;
  }
}
