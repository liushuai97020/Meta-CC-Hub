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
    updateStats: (stats: Partial<UsageStats>) =>
      ipcRenderer.invoke("usage:updateStats", stats),
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
    sendMessage: (message: string, cwd?: string, annotations?: AnnotationContext[]) =>
      ipcRenderer.invoke("agent:sendMessage", { message, cwd, annotations }),
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
