/**
 * MetaCode Agent 新系统 IPC 处理器
 * 将 MCP 系统暴露给渲染进程（仅本地功能，去除了远程仓库和市场）
 */

import { ipcMain, BrowserWindow, app } from "electron";
import path from "path";
import { initAgentSystem, type AgentSystem } from "../agent";
import type { AgentConfig, ToolCallLog } from "../agent/types";
import { MemoryManager } from "../agent/memory";
import type { MemoryMessage } from "../agent/memory";
import { statSync } from "fs";

let agentSystem: AgentSystem | null = null;

/** 供 main.ts 获取 Agent 系统引用 */
export function getAgentSystem(): AgentSystem | null {
  return agentSystem;
}

/** 供 main.ts 初始化记忆系统 */
export function initMemorySystem(embeddingConfig?: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): void {
  if (!agentSystem) return;
  agentSystem.memoryManager.initialize(embeddingConfig);
  console.log("[MemoryIPC] 记忆系统已初始化");
}

/** 技能列表变更时的回调（由 main.ts 注册，用于推送更新给 claudeAgentInstance） */
let onSkillsChanged: (() => void) | null = null;
export function setOnSkillsChanged(cb: () => void): void {
  onSkillsChanged = cb;
}

/** 构建可用技能列表 Markdown（含完整步骤，让 Agent 知道如何执行） */
export function buildAvailableSkillsMd(): string {
  if (!agentSystem) return "";
  const lines: string[] = [];

  // ===== 技能列表 =====
  const skills = agentSystem.skillManager.getAll();
  if (skills.length > 0) {
    lines.push("## Available Skills");
    lines.push("When the user references a skill (e.g., [skill:name] in their message), you MUST follow that skill's steps exactly to complete the task:");
    lines.push("");
    for (const skill of skills) {
      const desc = skill.description || "无描述";
      lines.push(`### ${skill.name}`);
      lines.push(`描述: ${desc}`);
      if (skill.steps.length > 0) {
        lines.push("执行步骤:");
        for (const step of skill.steps) {
          const stepDesc = step.description || step.toolName;
          const stepParams = step.params ? ` (参数: ${JSON.stringify(step.params)})` : "";
          lines.push(`  ${step.id}: ${stepDesc} [使用工具: ${step.toolName}]${stepParams}`);
        }
      }
      lines.push("");
    }
  }

  // ===== MCP 工具列表 =====
  const servers = agentSystem.mcpClient?.getAllServers?.() || [];
  if (servers.length > 0) {
    lines.push("## Available MCP Tools");
    lines.push("The following MCP tools are available and can be called directly:");
    lines.push("");
    for (const server of servers) {
      const tools = server.tools || [];
      for (const tool of tools) {
        lines.push(`- **${tool.name}** (${server.name}): ${tool.description || ""}`);
      }
    }
    lines.push("");
  }

  // ===== 插件列表 =====
  const plugins = agentSystem.pluginManager?.getAll?.() || [];
  if (plugins.length > 0) {
    lines.push("## Available Plugins");
    for (const plugin of plugins) {
      const meta = plugin.meta;
      const name = meta.name || meta.id;
      const desc = meta.description || "";
      const status = plugin.status || "unknown";
      lines.push(`- **${name}** [${status}]: ${desc}`);
    }
    lines.push("");
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

/**
 * 解析用户消息中的标签上下文（[skill:xxx]、[mcp:xxx] 等）
 * 将标签替换为对应的完整指令内容
 */
export async function resolveTagContext(message: string): Promise<string> {
  if (!agentSystem) return message;

  // 匹配 [type:name] 格式的标签
  const tagRe = /\[(skill|mcp|tool|plugin):([^\]]+)\]/g;
  const tags: Array<{ type: string; name: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(message)) !== null) {
    tags.push({ type: m[1], name: m[2] });
  }

  if (tags.length === 0) return message;

  // 移除标签行（首行带标签的格式："[skill:xxx] [mcp:yyy]\n实际消息"）
  let cleaned = message.replace(/^(?:\[(?:skill|mcp|tool|plugin):[^\]]+\]\s*)+\n?/, "");

  const resolvers: Array<Promise<string>> = [];

  for (const tag of tags) {
    switch (tag.type) {
      case "skill": {
        const skills = agentSystem.skillManager.getAll();
        const skill = skills.find((s: any) => s.name === tag.name || s.id.includes(tag.name));
        if (skill && skill.steps.length > 0) {
          const stepsText = skill.steps.map((s: any) => {
            const paramsDesc = s.params ? JSON.stringify(s.params) : "";
            return `- ${s.description || s.toolName}: 调用 ${s.toolName}${paramsDesc ? `，参数: ${paramsDesc}` : ""}`;
          }).join("\n");
          resolvers.push(Promise.resolve(
            `【技能: ${skill.name}】\n${skill.description}\n\n执行步骤:\n${stepsText}`
          ));
        }
        break;
      }
      case "mcp": {
        const servers = agentSystem.mcpClient?.getAllServers?.() || [];
        for (const server of servers) {
          if (server.name === tag.name) {
            const toolNames = (server.tools || []).map((t: any) => t.name).join(", ");
            resolvers.push(Promise.resolve(
              `【MCP 服务: ${server.name}】\n工具列表: ${toolNames}\n状态: ${server.status}`
            ));
          }
        }
        break;
      }
      case "tool": {
        // 工具标签：提示 agent 可以调用该工具
        resolvers.push(Promise.resolve(
          `【工具: ${tag.name}】\n请使用 ${tag.name} 工具完成相关操作。`
        ));
        break;
      }
      case "plugin": {
        const plugins = agentSystem.pluginManager?.getAll?.() || [];
        for (const plugin of plugins) {
          const meta = plugin.meta;
          if ((meta.name || meta.id) === tag.name) {
            resolvers.push(Promise.resolve(
              `【插件: ${tag.name}】\n${meta.description || ""}\n关联技能: ${(plugin.boundSkills || []).join(", ")}`
            ));
          }
        }
        break;
      }
    }
  }

  const resolved = await Promise.all(resolvers);
  if (resolved.length === 0) return cleaned;

  return `=== 用户选择的上下文 ===\n${resolved.join("\n\n")}\n=== 用户消息 ===\n${cleaned}`;
}

/**
 * 初始化 Agent 系统并注册 IPC 通道
 */
export function registerAgentIPC(store: any): void {
  try {
    agentSystem = initAgentSystem();
    console.log("[AgentIPC] Agent 系统已就绪");

    // 初始化日志数据库
    const userDataPath = app.getPath("userData");
    const logDbPath = path.join(userDataPath, "metacore-logs.db");
    agentSystem.logManager.init(logDbPath);
    console.log("[AgentIPC] 日志系统已初始化:", logDbPath);

    // 恢复持久化的 Agent 配置
    const savedAgentConfig = store.get("agentConfig");
    if (savedAgentConfig && agentSystem) {
      agentSystem.agentEngine.updateConfig(savedAgentConfig);
      console.log("[AgentIPC] 已恢复持久化的 Agent 配置");
    }

    // 恢复持久化的 Memory 配置
    const savedMemoryConfig = store.get("memoryConfig");
    if (savedMemoryConfig && agentSystem) {
      agentSystem.memoryManager.updateConfig(savedMemoryConfig);
      console.log("[AgentIPC] 已恢复持久化的 Memory 配置");
    }

    // 恢复持久化的插件启用/禁用状态
    const savedPluginStates = store.get("pluginStates") || {};
    for (const [pluginId, status] of Object.entries(savedPluginStates)) {
      if (status === "disabled") {
        agentSystem?.pluginManager.disable(pluginId);
      }
    }
    console.log("[AgentIPC] 已恢复持久化的插件状态");
  } catch (err) {
    console.error("[AgentIPC] Agent 系统初始化失败:", err);
  }

  // ========================
  // MCP 工具管理
  // ========================

  ipcMain.handle("agent-v2:getTools", () => {
    if (!agentSystem) return [];
    return agentSystem.mcpClient.getAllTools();
  });

  ipcMain.handle("agent-v2:getBuiltinTools", () => {
    if (!agentSystem) return [];
    return agentSystem.toolManager.getAll();
  });

  ipcMain.handle("agent-v2:getToolLogs", (_event, filter?: { sourceType?: string; sourceName?: string; status?: string; startTime?: number; endTime?: number; limit?: number; offset?: number }) => {
    if (!agentSystem) return [];
    return agentSystem.logManager.getLogs(
      filter?.limit ?? 200,
      filter?.offset ?? 0,
      filter ? { sourceType: filter.sourceType, sourceName: filter.sourceName, status: filter.status, startTime: filter.startTime, endTime: filter.endTime } : undefined,
    );
  });

  ipcMain.handle("agent-v2:clearToolLogs", (_event, filter?: { sourceType?: string; sourceName?: string }) => {
    if (!agentSystem) return { success: false };
    if (filter?.sourceType && filter?.sourceName) {
      const deleted = agentSystem.logManager.deleteLogsBySource(filter.sourceType, filter.sourceName);
      return { success: true, deleted };
    }
    agentSystem.logManager.clearAll();
    return { success: true };
  });

  ipcMain.handle("agent-v2:getLogStats", () => {
    if (!agentSystem) return { totalCount: 0, dbSize: 0 };
    return agentSystem.logManager.getStats();
  });

  ipcMain.handle("agent-v2:cleanOldLogs", (_event, daysAgo?: number) => {
    if (!agentSystem) return { success: false, deleted: 0 };
    const deleted = agentSystem.logManager.cleanOldLogs(daysAgo ?? 30);
    return { success: true, deleted };
  });

  ipcMain.handle("agent-v2:removeTool", (_event, toolName: string) => {
    if (!agentSystem) return { success: false, error: "Agent 未初始化" };
    const ok = agentSystem.toolManager.remove(toolName);
    return { success: ok, error: ok ? undefined : "工具不存在" };
  });

  ipcMain.handle("agent-v2:setToolEnabled", (_event, toolName: string, enabled: boolean) => {
    if (!agentSystem) return { success: false, error: "Agent 未初始化" };
    try {
      agentSystem.toolManager.setEnabled(toolName, enabled);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ========================
  // MCP 服务器管理
  // ========================

  ipcMain.handle("agent-v2:getServers", () => {
    if (!agentSystem) return [];
    return agentSystem.mcpClient.getAllServers();
  });

  ipcMain.handle("agent-v2:addServer", async (_event, name: string, config: any) => {
    if (!agentSystem) return { success: false, error: "Agent 未初始化" };
    try {
      await agentSystem.mcpClient.addServer(name, config);
      onSkillsChanged?.(); // 刷新系统提示词（含 MCP 工具列表）
      return { success: true };
    } catch (err) {
      const errStr = String(err);
      console.error(`[AgentIPC] 添加服务器 "${name}" 失败:`, errStr);
      return { success: false, error: errStr };
    }
  });

  ipcMain.handle("agent-v2:removeServer", async (_event, name: string) => {
    if (!agentSystem) return { success: false, error: "Agent 未初始化" };
    try {
      await agentSystem.mcpClient.removeServer(name);
      onSkillsChanged?.();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("agent-v2:restartServer", async (_event, name: string) => {
    if (!agentSystem) return { success: false, error: "Agent 未初始化" };
    try {
      await agentSystem.mcpClient.restartServer(name);
      onSkillsChanged?.();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("agent-v2:reloadMCP", async () => {
    if (!agentSystem) return { success: false, error: "Agent 未初始化" };
    try {
      await agentSystem.mcpClient.reload();
      onSkillsChanged?.();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ========================
  // Skill 技能管理（仅本地）
  // ========================

  ipcMain.handle("agent-v2:getSkills", () => {
    if (!agentSystem) return [];
    return agentSystem.skillManager.getAll();
  });

  ipcMain.handle("agent-v2:refreshSkills", async () => {
    if (!agentSystem) return { success: false };
    try {
      await agentSystem.skillManager.refresh();
      onSkillsChanged?.();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("agent-v2:executeSkill", async (_event, skillId: string, params?: Record<string, unknown>) => {
    if (!agentSystem) return { success: false, error: "Agent 未初始化" };
    try {
      const result = await agentSystem.skillManager.execute(skillId, params);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ========================
  // Plugin 插件管理（仅本地）
  // ========================

  ipcMain.handle("agent-v2:getPlugins", () => {
    if (!agentSystem) return [];
    return agentSystem.pluginManager.getAll();
  });

  ipcMain.handle("agent-v2:enablePlugin", (_event, pluginId: string) => {
    if (!agentSystem) return { success: false };
    const result = agentSystem.pluginManager.enable(pluginId);
    if (result) {
      const states = store.get("pluginStates") || {};
      states[pluginId] = "enabled";
      store.set("pluginStates", states);
      onSkillsChanged?.(); // 刷新系统提示词（含插件列表）
    }
    return { success: result };
  });

  ipcMain.handle("agent-v2:disablePlugin", (_event, pluginId: string) => {
    if (!agentSystem) return { success: false };
    const result = agentSystem.pluginManager.disable(pluginId);
    if (result) {
      const states = store.get("pluginStates") || {};
      states[pluginId] = "disabled";
      store.set("pluginStates", states);
      onSkillsChanged?.();
    }
    return { success: result };
  });

  // ========================
  // 本地导入
  // ========================

  ipcMain.handle("agent-v2:importSkill", async (_event, filePath: string) => {
    if (!agentSystem) return { success: false, error: "Agent 未初始化" };
    try {
      if (statSync(filePath).isDirectory()) {
        const skills = await agentSystem.skillManager.importFromDirectory(filePath);
        onSkillsChanged?.();
        return { success: true, data: skills, count: skills.length };
      }
      const skill = await agentSystem.skillManager.importFromFile(filePath);
      if (!skill) return { success: false, error: "技能文件格式无效" };
      onSkillsChanged?.();
      return { success: true, data: skill, count: 1 };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("agent-v2:importPlugin", async (_event, filePath: string) => {
    if (!agentSystem) return { success: false, error: "Agent 未初始化" };
    try {
      if (statSync(filePath).isDirectory()) {
        const plugins = await agentSystem.pluginManager.importFromDirectory(filePath);
        return { success: true, data: plugins, count: plugins.length };
      }
      const fs = await import("fs/promises");
      const content = await fs.readFile(filePath, "utf-8");
      const pluginData = JSON.parse(content);
      const plugin = await agentSystem.pluginManager.install(
        pluginData.meta,
        "local",
        filePath,
      );
      if (pluginData.tools) {
        for (const toolName of pluginData.tools) {
          agentSystem.pluginManager.bindTool(plugin.meta.id, toolName);
        }
      }
      if (pluginData.skills) {
        for (const skillId of pluginData.skills) {
          agentSystem.pluginManager.bindSkill(plugin.meta.id, skillId);
        }
      }
      return { success: true, data: plugin, count: 1 };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("agent-v2:importTool", async (_event, filePath: string) => {
    if (!agentSystem) return { success: false, error: "Agent 未初始化" };
    try {
      if (statSync(filePath).isDirectory()) {
        const tools = await agentSystem.toolManager.importFromDirectory(filePath);
        return { success: true, data: tools, count: tools.length };
      }
      const tool = await agentSystem.toolManager.importFromFile(filePath);
      if (!tool) return { success: false, error: "工具文件格式无效" };
      return { success: true, data: tool, count: 1 };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("agent-v2:getGlobalMCPConfig", async () => {
    try {
      const { readGlobalMCPConfigRaw } = await import("../agent/mcp/config.js");
      const raw = await readGlobalMCPConfigRaw();
      return { success: true, data: raw };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("agent-v2:saveGlobalMCPConfig", async (_event, rawJson: string) => {
    try {
      // 校验 JSON 合法性
      JSON.parse(rawJson);
      const { writeGlobalMCPConfigRaw } = await import("../agent/mcp/config.js");
      await writeGlobalMCPConfigRaw(rawJson);
      // 重新加载 MCP
      if (agentSystem) {
        await agentSystem.mcpClient.reload();
        onSkillsChanged?.();
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ========================
  // Agent 配置
  // ========================

  ipcMain.handle("agent-v2:getConfig", () => {
    if (!agentSystem) return null;
    return {
      agent: agentSystem.agentEngine.getConfig(),
    };
  });

  ipcMain.handle("agent-v2:updateConfig", (_event, config: { agent?: Partial<AgentConfig> }) => {
    if (!agentSystem) return { success: false };
    if (config.agent) {
      agentSystem.agentEngine.updateConfig(config.agent);
      store.set("agentConfig", agentSystem.agentEngine.getConfig());
      if (config.agent.composioApiKey) {
        process.env.COMPOSIO_API_KEY = config.agent.composioApiKey;
      }
    }
    return { success: true };
  });

  // ========================
  // MCP 系统状态
  // ========================

  ipcMain.handle("agent-v2:getStatus", () => {
    if (!agentSystem) return { ready: false };
    return {
      ready: true,
      serverCount: agentSystem.mcpClient.serverCount,
      toolCount: agentSystem.mcpClient.count + agentSystem.toolManager.count,
      builtinToolCount: agentSystem.toolManager.count,
      skillCount: agentSystem.skillManager.count,
      pluginCount: agentSystem.pluginManager.count,
      agentEngine: agentSystem.agentEngine.getStatus(),
    };
  });

  // ========================
  // Agent 执行
  // ========================

  ipcMain.handle(
    "agent-v2:sendMessage",
    async (
      _event,
      params: {
        message: string;
        history?: Array<{ role: string; content: string }>;
      },
    ) => {
      if (!agentSystem) {
        return { success: false, error: "Agent 系统未初始化" };
      }

      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      if (!win) return { success: false, error: "找不到窗口" };

      try {
        const result = await agentSystem.agentEngine.sendMessage(
          params.message,
          {
            onStatus: (status: string) => win.webContents.send("agent-v2:status", status),
            onChunk: (text: string) => win.webContents.send("agent-v2:chunk", text),
            onToolStart: (toolName, input) =>
              win.webContents.send("agent-v2:tool-start", { toolName, input }),
            onToolEnd: (toolName, output, status) =>
              win.webContents.send("agent-v2:tool-end", { toolName, output, status }),
            onError: (error: string) => win.webContents.send("agent-v2:error", error),
            onDone: (usage) => win.webContents.send("agent-v2:done", usage),
          },
          params.history,
        );

        return { success: true, data: result };
      } catch (err) {
        win.webContents.send("agent-v2:error", String(err));
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle("agent-v2:abort", () => {
    if (!agentSystem) return { success: false };
    agentSystem.agentEngine.abort();
    return { success: true };
  });

  // ========================
  // 记忆系统（RAG + 向量记忆）
  // ========================

  const mem = (): MemoryManager => {
    if (!agentSystem) throw new Error("Agent 系统未初始化");
    return agentSystem.memoryManager;
  };

  // RAG 查询增强
  ipcMain.handle("memory:augmentQuery", async (_event, query: string, sessionId: string, systemPrompt: string) => {
    try {
      const result = await mem().augmentQuery(query, sessionId, systemPrompt);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("memory:retrieveMemories", async (_event, query: string, sessionId?: string) => {
    try {
      const result = await mem().retrieveMemories(query, sessionId);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 会话
  ipcMain.handle("memory:createSession", (_event, id: string, title: string) => {
    const session = mem().createSession(id, title);
    return { success: true, data: session };
  });

  ipcMain.handle("memory:getSessions", () => {
    return { success: true, data: mem().getAllSessions() };
  });

  ipcMain.handle("memory:deleteSession", (_event, id: string) => {
    mem().deleteSession(id);
    return { success: true };
  });

  // 消息
  ipcMain.handle("memory:addMessage", (_event, msg: MemoryMessage) => {
    mem().addMessage(msg);
    return { success: true };
  });

  ipcMain.handle("memory:getSessionMessages", (_event, sessionId: string, limit?: number, offset?: number) => {
    const data = mem().getSessionMessages(sessionId, limit, offset);
    return { success: true, data };
  });

  // 向量记忆
  ipcMain.handle("memory:memorize", async (_event, messageId: string, sessionId: string, text: string, summary?: string) => {
    try {
      await mem().memorize(messageId, sessionId, text, summary);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("memory:memorizeSession", async (_event, sessionId: string) => {
    try {
      const messages = mem().getSessionMessages(sessionId, 500);
      await mem().memorizeSessionMessages(sessionId, messages);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 配置
  ipcMain.handle("memory:getConfig", () => {
    return { success: true, data: mem().getConfig() };
  });

  ipcMain.handle("memory:updateConfig", (_event, config: Record<string, unknown>) => {
    mem().updateConfig(config as any);

    // 用记忆系统独立的 Embedding 配置重新配置提供者
    const embConfig = mem().getConfig();
    if (embConfig.embeddingBaseUrl) {
      mem().configureEmbedding({
        baseUrl: embConfig.embeddingBaseUrl,
        apiKey: embConfig.embeddingApiKey || undefined,
        model: embConfig.embeddingModel,
      });
    }

    store.set("memoryConfig", mem().getConfig());
    return { success: true };
  });

  // 用量统计
  ipcMain.handle("memory:logUsage", (_event, data: { tokens: number; requests: number; gatewayId?: string; gatewayName?: string }) => {
    mem().logUsage(data.gatewayId, data.gatewayName, data.tokens, data.requests);
    return { success: true };
  });

  ipcMain.handle("memory:getUsageStats", (_event, startDate?: string, endDate?: string) => {
    const stats = mem().getUsageStats(startDate, endDate);
    return { success: true, data: stats };
  });

  // 系统
  ipcMain.handle("memory:getStats", () => {
    return { success: true, data: mem().getStats() };
  });

  ipcMain.handle("memory:clearAll", () => {
    mem().clearAll();
    return { success: true };
  });
}
