/**
 * MetaCode Agent 新系统引导
 * 组装并初始化所有模块
 */

import { MCPClient } from "./mcp/client";
import { SkillManager } from "./skills/manager";
import { PluginManager } from "./plugins/manager";
import { AgentEngine } from "./engine";
import { ToolManager } from "./tools";
import { MemoryManager } from "./memory";
import { LogManager } from "./logger";

/** Agent 系统聚合接口 */
export interface AgentSystem {
  mcpClient: MCPClient;
  toolManager: ToolManager;
  skillManager: SkillManager;
  pluginManager: PluginManager;
  agentEngine: AgentEngine;
  memoryManager: MemoryManager;
  logManager: LogManager;
}

/** 初始化整个 Agent 系统 */
export function initAgentSystem(): AgentSystem {
  console.log("[AgentSystem] 初始化 MCP Agent 系统...");

  // 1. 创建日志管理器（无依赖，延迟初始化 DB）
  const logManager = new LogManager();

  // 2. 创建工具管理器（无依赖）
  const toolManager = new ToolManager();
  toolManager.setLogManager(logManager);

  // 3. 创建 MCP 客户端
  const mcpClient = new MCPClient();
  mcpClient.setLogManager(logManager);

  // 4. 创建技能管理器（依赖 MCP）
  const skillManager = new SkillManager(mcpClient);

  // 5. 创建插件管理器（依赖 MCP + 技能）
  const pluginManager = new PluginManager(mcpClient, skillManager);

  // 6. 创建 Agent 引擎（依赖 MCP）
  const agentEngine = new AgentEngine(mcpClient);

  // 7. 创建记忆管理器（延迟初始化 DB）
  const memoryManager = new MemoryManager();

  // 8. 异步初始化 MCP 连接（不阻塞主进程）
  mcpClient.initialize().then(() => {
    const toolCount = mcpClient.count;
    const serverCount = mcpClient.serverCount;
    console.log(`[AgentSystem] MCP 初始化完成: ${serverCount} 服务器, ${toolCount} 工具`);
  }).catch((err) => {
    console.error("[AgentSystem] MCP 初始化失败:", err);
  });

  const system: AgentSystem = {
    mcpClient,
    toolManager,
    skillManager,
    pluginManager,
    agentEngine,
    memoryManager,
    logManager,
  };

  console.log("[AgentSystem] Agent 系统已就绪");
  return system;
}
