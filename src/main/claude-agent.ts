/**
 * Claude Agent 管理器
 * 使用 @anthropic-ai/sdk 直接调用 Anthropic Messages API
 * 本地实现 Read/Edit/Write/Bash 工具，完全跳过子进程
 */
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SdkQuery = any;

interface AgentConfig {
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  maxTokens?: number;
  modelType?: ModelType;
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
  private activeQuery: SdkQuery | null = null;
  private abortController: AbortController | null = null;
  // @anthropic-ai/sdk ESM 模块（动态 import 后缓存）
  private sdkModule: any = null;

  constructor() {}

  async initialize(modelConfig: ModelConfig): Promise<void> {
    this.config = this.mapModelConfig(modelConfig);
    this.activeQuery = null;
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
        return await this.sendViaOllama(message, callbacks);
      }
      return await this.sendViaDirectAPI(message, callbacks, cwd);
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
   * 直接通过 @anthropic-ai/sdk 调用 Messages API
   * 本地实现工具，完全跳过 Claude Code 子进程
   */
  private async sendViaDirectAPI(
    message: string,
    callbacks: StreamCallbacks,
    cwd?: string,
  ): Promise<AgentResponse> {
    callbacks.onStatus(`Querying ${this.config!.modelName}...`);

    this.abortController = new AbortController();

    if (!this.sdkModule) {
      this.sdkModule = await import("@anthropic-ai/sdk");
    }
    const Anthropic = this.sdkModule.default;

    const client = new Anthropic({
      apiKey: this.config!.apiKey || "",
      baseURL: this.config!.baseUrl,
    });

    const model = this.config!.modelName || "claude-sonnet-4-6";
    const maxTokens = this.config!.maxTokens || 8192;
    const systemPrompt = this.buildSystemPrompt(model);
    const messages: any[] = [{ role: "user", content: message }];

    let fullContent = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let iteration = 0; iteration < 20; iteration++) {
      if (iteration > 0) {
        callbacks.onStatus(`Continuing (step ${iteration + 1})...`);
      }

      let stream: any;
      try {
        stream = client.messages.stream({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
          tools: TOOLS,
        }, { signal: this.abortController?.signal });
      } catch (err: any) {
        if (fullContent) break;
        throw err;
      }

      let textAccumulator = "";
      const toolUseBlocks: any[] = [];
      const thinkingBlocks: any[] = [];
      let currentToolUse: any = null;
      let currentThinking: string | null = null;

      try {
        for await (const event of stream) {
          switch (event.type) {
            case "message_start":
              if (event.message?.usage) {
                totalInputTokens += event.message.usage.input_tokens || 0;
              }
              break;

            case "content_block_start":
              if (event.content_block?.type === "tool_use") {
                currentToolUse = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: "",
                  parsedInput: null,
                };
                currentThinking = null;
              } else if (event.content_block?.type === "thinking") {
                currentThinking = "";
                currentToolUse = null;
              }
              break;

            case "content_block_delta":
              if (event.delta?.type === "text_delta") {
                textAccumulator += event.delta.text;
                callbacks.onChunk(event.delta.text);
              } else if (event.delta?.type === "input_json_delta") {
                if (currentToolUse) {
                  currentToolUse.input += event.delta.partial_json;
                }
              } else if (event.delta?.type === "thinking_delta") {
                if (currentThinking !== null) {
                  currentThinking += event.delta.thinking || "";
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
              if (event.usage) {
                totalOutputTokens += event.usage.output_tokens || 0;
              }
              break;
          }
        }
      } finally {
        // 确保流被正确关闭
      }

      fullContent += textAccumulator;

      if (toolUseBlocks.length === 0) {
        break;
      }

      // 构建 assistant 消息（保留所有 content block 类型，避免 thinking 模式校验失败）
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
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
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
      : `You are ${modelName}, an AI assistant. You are not Claude.`;

    return [
      identity,
      "You are integrated into MetaCode, a cross-platform desktop AI programming assistant.",
      "You have access to the following tools: Read, Edit, Write, Bash.",
      "",
      "When the user sends annotation modification requests, they will include file paths and line numbers. Follow these rules strictly:",
      "1. Read the specified file using the Read tool (NOT Bash - never use cat/echo or other shell commands to read files).",
      "2. Apply the requested changes using Edit or Write tool.",
      "3. Output ONLY the modification result in plain text. Example format:",
      "   '已修改文件 X: 将 Y 改为 Z'",
      "   Do NOT output: tool names (Read/Edit/Write/Bash), emojis/icons, code blocks, or intermediate steps.",
      "   Do NOT say '已读取文件' or '正在读取' - just state the change itself.",
      "   Do NOT ask for confirmation - the user has already reviewed the annotations.",
      "4. Use Bash ONLY when explicitly needed (e.g., installing packages, running build commands).",
      "   Do NOT use Bash to read, write, or edit files.",
      "",
      "CRITICAL: Do NOT include tool names, emojis, or step-by-step descriptions in your response.",
      "Only output the final result of your work in natural language, nothing else.",
    ].join("\n");
  }

  // ======================
  // Ollama（local）
  // ======================

  private async sendViaOllama(
    message: string,
    callbacks: StreamCallbacks,
  ): Promise<AgentResponse> {
    const baseUrl = (this.config!.baseUrl || "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    const url = `${baseUrl}/api/chat`;

    callbacks.onStatus(`Calling Ollama ${this.config!.modelName}...`);

    const body = JSON.stringify({
      model: this.config!.modelName,
      messages: [{ role: "user", content: message }],
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
            callbacks.onStatus("Complete");
            callbacks.onDone({
              inputTokens: parsed.prompt_eval_count || 0,
              outputTokens: parsed.eval_count || 0,
            });
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    return {
      content: fullContent || "(no content)",
      usage: { inputTokens: 0, outputTokens: 0 },
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
    if (this.activeQuery) {
      try {
        await this.activeQuery.interrupt();
      } catch {
        // ignore if already done
      }
    }
    this.activeQuery = null;
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
    };
  }

  getConfig(): AgentConfig | null {
    return this.config;
  }
}
