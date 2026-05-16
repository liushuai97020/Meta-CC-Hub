/**
 * MetaCode  预加载脚本
 * 通过 contextBridge 暴露安全的 IPC API 给渲染进程
 * 确保主进程 API 不会直接暴露给渲染进程
 */
import { contextBridge, ipcRenderer } from "electron";

/**
 * 安全暴露的 API 接口定义
 */
const api = {
  // ========================
  // 窗口控制
  // ========================
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  },

  // ========================
  // 文件系统操作
  // ========================
  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke("fs:readFile", filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke("fs:writeFile", filePath, content),
    readDirectory: (dirPath: string) =>
      ipcRenderer.invoke("fs:readDirectory", dirPath),
    selectDirectory: () => ipcRenderer.invoke("fs:selectDirectory"),
    selectFile: () => ipcRenderer.invoke("fs:selectFile"),
    exists: (filePath: string) => ipcRenderer.invoke("fs:exists", filePath),
    findFile: (baseDir: string, fileName: string, extensions: string[]) =>
      ipcRenderer.invoke("fs:findFile", baseDir, fileName, extensions),
  },

  // ========================
  // 预览窗口控制
  // ========================
  preview: {
    createTab: (url: string) => ipcRenderer.invoke("preview:createTab", url),
    closeTab: (tabId: string) => ipcRenderer.invoke("preview:closeTab", tabId),
    switchTab: (tabId: string) => ipcRenderer.invoke("preview:switchTab", tabId),
    resizeActiveTab: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke("preview:resizeActiveTab", bounds),
    hideAll: () => ipcRenderer.invoke("preview:hideAll"),
    refresh: () => ipcRenderer.invoke("preview:refresh"),
    executeJavaScript: (script: string) =>
      ipcRenderer.invoke("preview:executeJavaScript", script),
    executeJavaScriptOnAll: (script: string) =>
      ipcRenderer.invoke("preview:executeJavaScriptOnAll", script),
    navigateCurrentTab: (url: string) =>
      ipcRenderer.invoke("preview:navigateCurrentTab", url),
    captureScreenshot: (rect?: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke("preview:captureScreenshot", rect),
    getUrlHistory: () => ipcRenderer.invoke("preview:getUrlHistory"),
    setUrlHistory: (history: string[]) => ipcRenderer.invoke("preview:setUrlHistory", history),
  },

  // ========================
  // 模型配置管理
  // ========================
  models: {
    getAll: () => ipcRenderer.invoke("models:getAll"),
    add: (model: ModelConfig) => ipcRenderer.invoke("models:add", model),
    update: (modelId: string, updates: Partial<ModelConfig>) =>
      ipcRenderer.invoke("models:update", modelId, updates),
    delete: (modelId: string) => ipcRenderer.invoke("models:delete", modelId),
    setActive: (modelId: string) =>
      ipcRenderer.invoke("models:setActive", modelId),
    getActive: () => ipcRenderer.invoke("models:getActive"),
    testConnection: (modelConfig: Partial<ModelConfig>) =>
      ipcRenderer.invoke("models:testConnection", modelConfig),
  },

  // ========================
  // 网关配置管理
  // ========================
  gateway: {
    getAll: () => ipcRenderer.invoke("gateway:getAll"),
    add: (profile: GatewayProfile) =>
      ipcRenderer.invoke("gateway:add", profile),
    update: (profileId: string, updates: Partial<GatewayProfile>) =>
      ipcRenderer.invoke("gateway:update", profileId, updates),
    delete: (profileId: string) =>
      ipcRenderer.invoke("gateway:delete", profileId),
    setActive: (profileId: string) =>
      ipcRenderer.invoke("gateway:setActive", profileId),
    getActive: () => ipcRenderer.invoke("gateway:getActive"),
    deactivate: () => ipcRenderer.invoke("gateway:deactivate"),
    testConnection: (profile: Partial<GatewayProfile>) =>
      ipcRenderer.invoke("gateway:testConnection", profile),
    pullModels: (profile: Partial<GatewayProfile>) =>
      ipcRenderer.invoke("gateway:pullModels", profile),
  },

  // ========================
  // 用量统计
  // ========================
  usage: {
    getStats: () => ipcRenderer.invoke("usage:getStats"),
    updateStats: (data: {
      tokens: number;
      requests: number;
      gatewayId?: string;
      gatewayName?: string;
    }) => ipcRenderer.invoke("usage:updateStats", data),
  },

  // ========================
  // 会话管理
  // ========================
  sessions: {
    getAll: () => ipcRenderer.invoke("sessions:getAll"),
    create: (session: SessionData) =>
      ipcRenderer.invoke("sessions:create", session),
    delete: (sessionId: string) =>
      ipcRenderer.invoke("sessions:delete", sessionId),
    archive: (sessionId: string) =>
      ipcRenderer.invoke("sessions:archive", sessionId),
    setActive: (sessionId: string) =>
      ipcRenderer.invoke("sessions:setActive", sessionId),
    getActive: () => ipcRenderer.invoke("sessions:getActive"),
    addMessage: (sessionId: string, message: ChatMessage) =>
      ipcRenderer.invoke("sessions:addMessage", sessionId, message),
    updateMessageContent: (sessionId: string, messageId: string, content: string) =>
      ipcRenderer.invoke("sessions:updateMessageContent", sessionId, messageId, content),
    update: (sessionId: string, updates: Partial<SessionData>) =>
      ipcRenderer.invoke("sessions:update", sessionId, updates),
  },

  // ========================
  // Claude Agent SDK
  // ========================
  agent: {
    init: () => ipcRenderer.invoke("agent:init"),
    sendMessage: (message: string, cwd?: string, annotations?: AnnotationContext[], history?: Array<{role: string; content: string}>) =>
      ipcRenderer.invoke("agent:sendMessage", { message, cwd, annotations, history }),
    abort: () => ipcRenderer.invoke("agent:abort"),
    // 流式事件监听
    onChunk: (callback: (text: string) => void) => {
      ipcRenderer.on("agent:chunk", (_event, text) => callback(text));
    },
    onStatus: (callback: (status: string) => void) => {
      ipcRenderer.on("agent:status", (_event, status) => callback(status));
    },
    onToolUse: (
      callback: (data: {
        toolName: string;
        input: Record<string, unknown>;
      }) => void,
    ) => {
      ipcRenderer.on("agent:tool-use", (_event, data) => callback(data));
    },
    onToolResult: (
      callback: (data: { toolName: string; status: string }) => void,
    ) => {
      ipcRenderer.on("agent:tool-result", (_event, data) => callback(data));
    },
    onDone: (
      callback: (usage: { inputTokens: number; outputTokens: number }) => void,
    ) => {
      ipcRenderer.on("agent:done", (_event, usage) => callback(usage));
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on("agent:error", (_event, error) => callback(error));
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("agent:chunk");
      ipcRenderer.removeAllListeners("agent:status");
      ipcRenderer.removeAllListeners("agent:tool-use");
      ipcRenderer.removeAllListeners("agent:tool-result");
      ipcRenderer.removeAllListeners("agent:done");
      ipcRenderer.removeAllListeners("agent:error");
    },
  },

  // ========================
  // Agent V2（增强版 Agent 系统：Tool/Skill/Plugin/MCP）
  // ========================
  agentV2: {
    // 工具管理
    getTools: () => ipcRenderer.invoke("agent-v2:getTools"),
    getToolLogs: (filter?: { sourceType?: string; sourceName?: string; status?: string; startTime?: number; endTime?: number; limit?: number; offset?: number }) =>
      ipcRenderer.invoke("agent-v2:getToolLogs", filter),
    clearToolLogs: (filter?: { sourceType?: string; sourceName?: string }) =>
      ipcRenderer.invoke("agent-v2:clearToolLogs", filter),

    getLogStats: () => ipcRenderer.invoke("agent-v2:getLogStats"),
    cleanOldLogs: (daysAgo?: number) => ipcRenderer.invoke("agent-v2:cleanOldLogs", daysAgo),
    removeTool: (toolName: string) =>
      ipcRenderer.invoke("agent-v2:removeTool", toolName),
    // MCP 服务器管理
    getServers: () => ipcRenderer.invoke("agent-v2:getServers"),
    addServer: (name: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke("agent-v2:addServer", name, config),
    removeServer: (name: string) =>
      ipcRenderer.invoke("agent-v2:removeServer", name),
    restartServer: (name: string) =>
      ipcRenderer.invoke("agent-v2:restartServer", name),
    reloadMCP: () => ipcRenderer.invoke("agent-v2:reloadMCP"),
    getGlobalMCPConfig: () =>
      ipcRenderer.invoke("agent-v2:getGlobalMCPConfig"),
    saveGlobalMCPConfig: (rawJson: string) =>
      ipcRenderer.invoke("agent-v2:saveGlobalMCPConfig", rawJson),

    // 技能管理
    getSkills: () => ipcRenderer.invoke("agent-v2:getSkills"),
    refreshSkills: () => ipcRenderer.invoke("agent-v2:refreshSkills"),
    executeSkill: (skillId: string, params?: Record<string, unknown>) =>
      ipcRenderer.invoke("agent-v2:executeSkill", skillId, params),

    // 插件管理
    getPlugins: () => ipcRenderer.invoke("agent-v2:getPlugins"),
    enablePlugin: (pluginId: string) => ipcRenderer.invoke("agent-v2:enablePlugin", pluginId),
    disablePlugin: (pluginId: string) => ipcRenderer.invoke("agent-v2:disablePlugin", pluginId),

    // 内置工具
    getBuiltinTools: () => ipcRenderer.invoke("agent-v2:getBuiltinTools"),

    // 本地导入
    importSkill: (filePath: string) => ipcRenderer.invoke("agent-v2:importSkill", filePath),
    importPlugin: (filePath: string) => ipcRenderer.invoke("agent-v2:importPlugin", filePath),
    importTool: (filePath: string) => ipcRenderer.invoke("agent-v2:importTool", filePath),

    // Agent 配置
    getConfig: () => ipcRenderer.invoke("agent-v2:getConfig"),
    updateConfig: (config: { agent?: Record<string, unknown>; mcp?: Record<string, unknown> }) =>
      ipcRenderer.invoke("agent-v2:updateConfig", config),

    // 系统状态
    getStatus: () => ipcRenderer.invoke("agent-v2:getStatus"),

    // Agent 执行（增强版）
    sendMessage: (message: string, history?: Array<{ role: string; content: string }>) =>
      ipcRenderer.invoke("agent-v2:sendMessage", { message, history }),
    abort: () => ipcRenderer.invoke("agent-v2:abort"),

    // 流式事件监听
    onStatus: (callback: (status: string) => void) => {
      ipcRenderer.on("agent-v2:status", (_event, status) => callback(status));
    },
    onChunk: (callback: (text: string) => void) => {
      ipcRenderer.on("agent-v2:chunk", (_event, text) => callback(text));
    },
    onToolStart: (callback: (data: { toolName: string; input: Record<string, unknown> }) => void) => {
      ipcRenderer.on("agent-v2:tool-start", (_event, data) => callback(data));
    },
    onToolEnd: (callback: (data: { toolName: string; output: unknown; status: string }) => void) => {
      ipcRenderer.on("agent-v2:tool-end", (_event, data) => callback(data));
    },
    onDone: (callback: (usage: { inputTokens: number; outputTokens: number }) => void) => {
      ipcRenderer.on("agent-v2:done", (_event, usage) => callback(usage));
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on("agent-v2:error", (_event, error) => callback(error));
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("agent-v2:status");
      ipcRenderer.removeAllListeners("agent-v2:chunk");
      ipcRenderer.removeAllListeners("agent-v2:tool-start");
      ipcRenderer.removeAllListeners("agent-v2:tool-end");
      ipcRenderer.removeAllListeners("agent-v2:done");
      ipcRenderer.removeAllListeners("agent-v2:error");
    },
  },

  // ========================
  // 主题
  // ========================
  theme: {
    get: () => ipcRenderer.invoke("theme:get"),
    set: (theme: "light" | "dark") => ipcRenderer.invoke("theme:set", theme),
  },

  // ========================
  // 应用配置
  // ========================
  app: {
    getConfig: () => ipcRenderer.invoke("app:getConfig"),
    getAppConfig: () => ipcRenderer.invoke("app:getAppConfig"),
    updateAppConfig: (config: Partial<{ fontSize: number; autoLaunch: boolean }>) =>
      ipcRenderer.invoke("app:updateAppConfig", config),
    getProxy: () => ipcRenderer.invoke("app:getProxy"),
    setProxy: (proxy: ProxyConfig | null) => ipcRenderer.invoke("app:setProxy", proxy),
    testProxy: (proxy: ProxyConfig) => ipcRenderer.invoke("app:testProxy", proxy),
    getDataPath: () => ipcRenderer.invoke("app:getDataPath"),
    getVersion: () => ipcRenderer.invoke("app:getVersion"),
    clearCache: () => ipcRenderer.invoke("app:clearCache"),
  },

  // ========================
  // 项目管理
  // ========================
  projects: {
    getRecent: () => ipcRenderer.invoke("projects:getRecent"),
    addRecent: (projectPath: string) =>
      ipcRenderer.invoke("projects:addRecent", projectPath),
    removeRecent: (projectPath: string) =>
      ipcRenderer.invoke("projects:removeRecent", projectPath),
    getSessionsByProject: (projectPath: string) =>
      ipcRenderer.invoke("projects:getSessionsByProject", projectPath),
  },

  // ========================
  // 记忆系统（RAG + 向量记忆）
  // ========================
  memory: {
    augmentQuery: (query: string, sessionId: string, systemPrompt: string) =>
      ipcRenderer.invoke("memory:augmentQuery", query, sessionId, systemPrompt),
    retrieveMemories: (query: string, sessionId?: string) =>
      ipcRenderer.invoke("memory:retrieveMemories", query, sessionId),

    createSession: (id: string, title: string) =>
      ipcRenderer.invoke("memory:createSession", id, title),
    getSessions: () => ipcRenderer.invoke("memory:getSessions"),
    deleteSession: (id: string) =>
      ipcRenderer.invoke("memory:deleteSession", id),

    addMessage: (msg: { id: string; sessionId: string; role: string; content: string; timestamp: string }) =>
      ipcRenderer.invoke("memory:addMessage", msg),
    getSessionMessages: (sessionId: string, limit?: number, offset?: number) =>
      ipcRenderer.invoke("memory:getSessionMessages", sessionId, limit, offset),

    memorize: (messageId: string, sessionId: string, text: string, summary?: string) =>
      ipcRenderer.invoke("memory:memorize", messageId, sessionId, text, summary),
    memorizeSession: (sessionId: string) =>
      ipcRenderer.invoke("memory:memorizeSession", sessionId),

    getConfig: () => ipcRenderer.invoke("memory:getConfig"),
    updateConfig: (config: Record<string, unknown>) =>
      ipcRenderer.invoke("memory:updateConfig", config),

    logUsage: (data: { tokens: number; requests: number; gatewayId?: string; gatewayName?: string }) =>
      ipcRenderer.invoke("memory:logUsage", data),
    getUsageStats: (startDate?: string, endDate?: string) =>
      ipcRenderer.invoke("memory:getUsageStats", startDate, endDate),

    getStats: () => ipcRenderer.invoke("memory:getStats"),
    clearAll: () => ipcRenderer.invoke("memory:clearAll"),
  },

  // ========================
  // 事件监听
  // ========================
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      "annotation-event",
      "element-selected",
      "preview-load-fail",
      "agent-status-change",
      "file-changed",
      "preview-tab-title-updated",
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

// 通过 contextBridge 暴露 API
contextBridge.exposeInMainWorld("electronAPI", api);
