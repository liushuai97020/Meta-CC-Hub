/**
 * MetaCode  主进程入口
 * 负责 Electron 窗口管理、IPC 通信、BrowserView 预览等功能
 */
import { app, BrowserWindow, ipcMain, BrowserView, dialog } from "electron";
import path from "path";
import fs from "fs";
import type { AgentConfig } from "../agent/types";

// ========================
// 全局变量
// ========================

let mainWindow: BrowserWindow | null = null;

// 多标签预览管理
interface PreviewTabEntry {
  id: string;
  view: BrowserView;
  url: string;
}
const previewTabs = new Map<string, PreviewTabEntry>();
let activePreviewTabId: string | null = null;

function removeAllPreviewViews(): void {
  if (!mainWindow) return;
  for (const [, entry] of previewTabs) {
    try { mainWindow.removeBrowserView(entry.view); } catch {}
  }
}
function setActivePreviewTab(tabId: string | null): void {
  if (!mainWindow) return;
  removeAllPreviewViews();
  activePreviewTabId = tabId;
  if (tabId && previewTabs.has(tabId)) {
    mainWindow.addBrowserView(previewTabs.get(tabId)!.view);
  }
}

// 动态导入 ESM 模块
let Store: any = null;
let ClaudeAgentManager: any = null;
let store: any = null;

/**
 * 异步初始化配置存储
 */
async function initStore(): Promise<void> {
  const electronStore = await import("electron-store");
  Store = electronStore.default;
  store = new Store({
    name: "MetaCode -config",
    defaults: {
      models: [] as ModelConfig[],
      activeModelId: null,
      gatewayProfiles: [] as GatewayProfile[],
      activeGatewayId: null,
      sessions: [] as SessionData[],
      activeSessionId: null,
      recentProjects: [] as string[],
      theme: "dark",
      windowBounds: { width: 1400, height: 900 },
      usageStats: { totalTokens: 0, totalRequests: 0, dailyStats: [], gatewayStats: {} },
      agentConfig: null as AgentConfig | null,
      memoryConfig: null as Record<string, unknown> | null,
      pluginStates: {} as Record<string, string>,
      globalProxy: null as ProxyConfig | null,
      appConfig: { fontSize: 14, autoLaunch: false } as { fontSize: number; autoLaunch: boolean },
    },
  });
}

/**
 * 解析有效的代理配置（网关/模型代理优先，回退全局代理）
 */
function resolveProxy(profileOrModelProxy?: ProxyConfig): ProxyConfig | null {
  if (profileOrModelProxy) return profileOrModelProxy;
  return store?.get("globalProxy") || null;
}

/** 将 ProxyConfig 转为 fetch 的 proxy 选项 */
function buildProxyOption(proxy: ProxyConfig) {
  return {
    protocol: proxy.protocol,
    host: proxy.host,
    port: proxy.port,
    ...(proxy.username ? { auth: `${proxy.username}:${proxy.password || ""}` } : {}),
  };
}

/**
 * 异步初始化 Claude Agent
 */
let claudeAgentInstance: any = null;

async function initClaudeAgent(): Promise<void> {
  try {
    const module = await import("./claude-agent.js");
    ClaudeAgentManager = module.ClaudeAgentManager;
    const models = store.get("models") as ModelConfig[];
    const activeId = store.get("activeModelId") as string | null;
    const activeModel = models.find((m) => m.id === activeId);
    if (activeModel) {
      claudeAgentInstance = new ClaudeAgentManager();
      await claudeAgentInstance.initialize(activeModel);
    }
  } catch (e) {
    console.error("[Main] Claude Agent 初始化失败:", e);
  }
}

/**
 * 创建主窗口
 */
function createMainWindow(): void {
  const bounds = store?.get("windowBounds") as { width: number; height: number } | undefined;

  mainWindow = new BrowserWindow({
    width: bounds?.width || 1400,
    height: bounds?.height || 900,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    titleBarStyle: "hidden",
    icon: path.join(app.getAppPath(), "build/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "../../preload/preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 开发模式加载 Vite 开发服务器，生产模式加载打包文件
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "bottom" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  mainWindow.on("resize", () => {
    if (mainWindow && store) {
      const [width, height] = mainWindow.getSize();
      store.set("windowBounds", { width, height });
    }
  });

  mainWindow.setMaxListeners(20);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * 初始化 IPC 通信处理器
 */
function setupIpcHandlers(): void {
  // ==========================================
  // 窗口控制
  // ==========================================
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized());

  // ==========================================
  // 文件系统操作
  // ==========================================
  ipcMain.handle("fs:readFile", async (_event, filePath: string) => {
    try {
      return { success: true, data: fs.readFileSync(filePath, "utf-8") };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    "fs:writeFile",
    async (_event, filePath: string, content: string) => {
      try {
        fs.writeFileSync(filePath, content, "utf-8");
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  ipcMain.handle("fs:readDirectory", async (_event, dirPath: string) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const tree = entries.map((entry) => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }));
      return { success: true, data: tree };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("fs:selectDirectory", async () => {
    if (!mainWindow) return { success: false, error: "No window" };
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: "Cancelled" };
    }
    return { success: true, data: result.filePaths[0] };
  });

  ipcMain.handle("fs:selectFile", async () => {
    if (!mainWindow) return { success: false, error: "No window" };
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [
        { name: "All Files", extensions: ["*"] },
        {
          name: "Code Files",
          extensions: [
            "js",
            "ts",
            "jsx",
            "tsx",
            "html",
            "css",
            "json",
            "py",
            "go",
            "rs",
          ],
        },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: "Cancelled" };
    }
    return { success: true, data: result.filePaths[0] };
  });

  ipcMain.handle("fs:exists", async (_event, filePath: string) => {
    try {
      return { success: true, data: fs.existsSync(filePath) };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("fs:findFile", async (_event, baseDir: string, fileName: string, extensions: string[]) => {
    try {
      // 三阶段递归搜索：
      // 1) 当前目录下文件名匹配 fileName.ext
      // 2) 子目录名匹配 fileName，且内含 index.{ext}
      // 3) 递归进入所有子目录（含匹配的目录名，以支持 fileName/fileName.ext 结构）
      function walk(dir: string): string | null {
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
        // 阶段 1：直接文件名匹配
        for (const entry of entries) {
          if (entry.isFile()) {
            const base = path.basename(entry.name, path.extname(entry.name));
            if (base === fileName && extensions.includes(path.extname(entry.name))) {
              return path.join(dir, entry.name);
            }
          }
        }
        // 阶段 2：目录名匹配 fileName，查 index.{ext}
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name === fileName) {
            try {
              const subDir = path.join(dir, entry.name);
              const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
              for (const sub of subEntries) {
                if (sub.isFile()) {
                  const base = path.basename(sub.name, path.extname(sub.name));
                  if (base === "index" && extensions.includes(path.extname(sub.name))) {
                    return path.join(subDir, sub.name);
                  }
                }
              }
            } catch {}
          }
        }
        // 阶段 3：递归进入所有子目录（隐藏目录和 node_modules 除外）
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
            const found = walk(path.join(dir, entry.name));
            if (found) return found;
          }
        }
        return null;
      }
      const result = walk(baseDir);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ==========================================
  // 多标签预览控制 (BrowserView)
  // ==========================================

  /** 获取当前激活标签的 BrowserView */
  function getActivePreviewView(): BrowserView | null {
    if (activePreviewTabId && previewTabs.has(activePreviewTabId)) {
      return previewTabs.get(activePreviewTabId)!.view;
    }
    return null;
  }

  ipcMain.handle("preview:createTab", async (_event, url: string) => {
    if (!mainWindow) return { success: false, error: "No main window" };

    const tabId = `preview_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const view = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    // 页面加载完成后重新注入 DOM 标注脚本 + 同步标注模式状态
    view.webContents.on("did-finish-load", async () => {
      try {
        await view.webContents.executeJavaScript(injectDomInspectorScript());
      } catch {}
      // 注入预览区域点击监听（用于 URL 历史弹窗关闭检测）
      try {
        await view.webContents.executeJavaScript(`
          document.addEventListener('mousedown',function(){console.log('__ANN__:{\"type\":\"__previewClick\"}');});
        `);
      } catch {}
      // 强制通知渲染进程，触发标注模式重同步（即使标题未变化）
      mainWindow?.webContents.send("preview-tab-title-updated", {
        tabId,
        title: view.webContents.getTitle(),
      });
    });

    // 监听页面标题更新
    view.webContents.on("page-title-updated", (_event, title) => {
      mainWindow?.webContents.send("preview-tab-title-updated", { tabId, title });
    });

    // 监听 console 消息，拦截标注事件 __ANN__: 前缀
    view.webContents.on("console-message", (_event, _level, message) => {
      if (message && typeof message === "string" && message.startsWith("__ANN__:")) {
        try {
          const payload = JSON.parse(message.slice(8));
          mainWindow?.webContents.send("annotation-event", payload);
        } catch { /* ignore malformed annotation messages */ }
      }
    });

    previewTabs.set(tabId, { id: tabId, view, url });
    setActivePreviewTab(tabId);

    if (url) {
      try {
        await view.webContents.loadURL(url);
      } catch {}
    }

    return { success: true, tabId };
  });

  ipcMain.handle("preview:closeTab", (_event, tabId: string) => {
    if (!mainWindow) return { success: false, error: "No main window" };

    const entry = previewTabs.get(tabId);
    if (!entry) return { success: false, error: "Tab not found" };

    mainWindow.removeBrowserView(entry.view);
    try { (entry.view.webContents as any).destroy(); } catch {}
    previewTabs.delete(tabId);

    if (activePreviewTabId === tabId) {
      const remaining = Array.from(previewTabs.keys());
      if (remaining.length > 0) {
        setActivePreviewTab(remaining[remaining.length - 1]);
      } else {
        activePreviewTabId = null;
      }
    }

    return { success: true };
  });

  ipcMain.handle("preview:switchTab", (_event, tabId: string) => {
    if (!previewTabs.has(tabId)) return { success: false, error: "Tab not found" };
    setActivePreviewTab(tabId);
    return { success: true };
  });

  ipcMain.handle(
    "preview:resizeActiveTab",
    (
      _event,
      bounds: { x: number; y: number; width: number; height: number },
    ) => {
      const view = getActivePreviewView();
      if (view) {
        view.setBounds(bounds);
        view.setAutoResize({ width: false, height: false });
      }
      return { success: true };
    },
  );

  ipcMain.handle("preview:hideAll", () => {
    removeAllPreviewViews();
    return { success: true };
  });

  ipcMain.handle("preview:refresh", async () => {
    const view = getActivePreviewView();
    if (view) {
      view.webContents.reload();
    }
    return { success: true };
  });

  ipcMain.handle(
    "preview:executeJavaScript",
    async (_event, script: string) => {
      const view = getActivePreviewView();
      if (view) {
        const result = await view.webContents.executeJavaScript(script);
        return { success: true, data: result };
      }
      return { success: false, error: "No active preview tab" };
    },
  );

  ipcMain.handle(
    "preview:executeJavaScriptOnAll",
    async (_event, script: string) => {
      const results: Array<{ tabId: string; success: boolean; data?: unknown; error?: string }> = [];
      for (const [tabId, entry] of previewTabs) {
        try {
          const result = await entry.view.webContents.executeJavaScript(script);
          results.push({ tabId, success: true, data: result });
        } catch (e) {
          results.push({ tabId, success: false, error: String(e) });
        }
      }
      return { success: true, results };
    },
  );

  ipcMain.handle("preview:navigateCurrentTab", async (_event, url: string) => {
    const view = getActivePreviewView();
    if (!view) return { success: false, error: "No active preview tab" };

    try {
      if (activePreviewTabId && previewTabs.has(activePreviewTabId)) {
        previewTabs.get(activePreviewTabId)!.url = url;
      }
      await view.webContents.loadURL(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    "preview:captureScreenshot",
    async (
      _event,
      rect?: { x: number; y: number; width: number; height: number },
    ) => {
      const view = getActivePreviewView();
      if (!view) return { success: false, error: "No active preview tab" };

      try {
        const image = await view.webContents.capturePage(rect);
        const dataUrl = image.toDataURL();
        return { success: true, data: dataUrl };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

// ==========================================
  // 模型配置管理
  // ==========================================


  /** 按提供商模式规范化模型配置 */
  function normalizeModelConfig(config: ModelConfig): ModelConfig {
    // 自动推断 apiFormat（如果不明确指定）
    if (!config.apiFormat) {
      if (config.type === "third-party" && config.provider !== "deepseek") {
        // 非 DeepSeek 的第三方 API 默认使用 OpenAI 格式
        config.apiFormat = "openai";
      } else {
        // official、local、DeepSeek 使用 Anthropic Messages API 格式
        config.apiFormat = "anthropic";
      }
    }
    return config;
  }

  ipcMain.handle("models:getAll", () => {
    return store.get("models");
  });

  ipcMain.handle("models:add", (_event, model: ModelConfig) => {
    const models = store.get("models") as ModelConfig[];
    model.id = model.id || `model_${Date.now()}`;
    model.createdAt = model.createdAt || new Date().toISOString();
    normalizeModelConfig(model);
    models.push(model);
    store.set("models", models);
    return { success: true, data: model };
  });

  ipcMain.handle(
    "models:update",
    (_event, modelId: string, updates: Partial<ModelConfig>) => {
      const models = store.get("models") as ModelConfig[];
      const index = models.findIndex((m) => m.id === modelId);
      if (index === -1) return { success: false, error: "Model not found" };
      models[index] = { ...models[index], ...updates };
      normalizeModelConfig(models[index]);
      store.set("models", models);
      return { success: true, data: models[index] };
    },
  );

  ipcMain.handle("models:delete", (_event, modelId: string) => {
    const models = store.get("models") as ModelConfig[];
    const filtered = models.filter((m) => m.id !== modelId);
    store.set("models", filtered);
    if (store.get("activeModelId") === modelId) {
      store.set("activeModelId", null);
    }
    return { success: true };
  });

  ipcMain.handle("models:setActive", async (_event, modelId: string) => {
    store.set("activeModelId", modelId);
    const models = store.get("models") as ModelConfig[];
    const model = models.find((m) => m.id === modelId);
    if (model) {
      if (claudeAgentInstance) {
        await claudeAgentInstance.switchModel(model);
      } else {
        claudeAgentInstance = new ClaudeAgentManager();
        await claudeAgentInstance.initialize(model);
      }
    }
    return { success: true };
  });

  ipcMain.handle("models:getActive", () => {
    const activeId = store.get("activeModelId");
    const models = store.get("models") as ModelConfig[];
    return models.find((m) => m.id === activeId) || null;
  });

  ipcMain.handle(
    "models:testConnection",
    async (_event, modelConfig: Partial<ModelConfig>) => {
      try {
        const url = modelConfig.baseUrl || "https://api.anthropic.com";
        const startTime = Date.now();

        // 根据不同类型选择不同的测试端点
        let testUrl = url;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (modelConfig.type === "official") {
          testUrl = `${url.replace(/\/$/, "")}/v1/messages`;
          if (modelConfig.apiKey) {
            headers["x-api-key"] = modelConfig.apiKey;
            headers["anthropic-version"] = "2023-06-01";
          }
        } else if (modelConfig.type === "third-party") {
          // OpenAI-compatible endpoint
          testUrl = `${url.replace(/\/$/, "")}/models`;
          if (modelConfig.apiKey) {
            headers["Authorization"] = `Bearer ${modelConfig.apiKey}`;
          }
        } else {
          // Local model (Ollama)
          testUrl = `${url.replace(/\/$/, "")}/api/tags`;
        }

        // 支持代理
        const fetchOptions: RequestInit = { method: "GET", headers };
        const effectiveProxy = resolveProxy(modelConfig.proxy);
        if (effectiveProxy) {
          (fetchOptions as any).proxy = buildProxyOption(effectiveProxy);
        }

        // 使用 fetch 测试连接，设置 10 秒超时
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        fetchOptions.signal = controller.signal;

        // 本地模型使用 HEAD 请求，其他使用 GET
        const response = await fetch(testUrl, fetchOptions);
        clearTimeout(timeout);

        if (response.ok || response.status === 401) {
          // 401 表示 API 存在但未授权，说明连接成功
          return { success: true, latency: Date.now() - startTime };
        }

        // 对于某些返回 200 的端点，直接认为成功
        return { success: true, latency: Date.now() - startTime };
      } catch (error: any) {
        if (error.name === "AbortError") {
          return { success: false, error: "连接超时（10秒）" };
        }
        return { success: false, error: String(error.message || error) };
      }
    },
  );

  // ==========================================
  // 网关配置管理
  // ==========================================

  const GATEWAY_MODEL_ENDPOINTS: Record<string, string> = {
    official: "/v1/models",
    "third-party": "/v1/models",
    local: "/api/tags",
  };

  ipcMain.handle("gateway:getAll", () => {
    return store.get("gatewayProfiles") || [];
  });

  ipcMain.handle("gateway:getActive", () => {
    const activeId = store.get("activeGatewayId");
    const profiles = store.get("gatewayProfiles") as GatewayProfile[];
    return profiles.find((p) => p.id === activeId) || null;
  });

  ipcMain.handle("gateway:add", (_event, profile: GatewayProfile) => {
    const profiles = store.get("gatewayProfiles") as GatewayProfile[];
    profile.id = profile.id || `gateway_${Date.now()}`;
    profile.createdAt = profile.createdAt || new Date().toISOString();
    profiles.push(profile);
    store.set("gatewayProfiles", profiles);
    return { success: true, data: profile };
  });

  /**
   * 同步活跃网关的 ModelConfig 并重新初始化 agent
   */
  async function syncActiveGatewayModel(profileId: string): Promise<void> {
    const activeId = store.get("activeGatewayId") as string | null;
    if (activeId !== profileId) return;

    const profiles = store.get("gatewayProfiles") as GatewayProfile[];
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile || !profile.defaultModel) return;

    const modelConfig: ModelConfig = {
      id: `gateway_model_${profileId}`,
      name: `${profile.name} - ${profile.defaultModel}`,
      type: profile.type,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      modelName: profile.defaultModel,
      proxy: resolveProxy(profile.proxy) || undefined,
      provider: profile.provider,
      apiFormat: profile.apiFormat || (
        (profile.type === "third-party" && profile.provider !== "deepseek")
          ? "openai" : "anthropic"
      ),
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true,
    };

    const models = store.get("models") as ModelConfig[];
    const existingIdx = models.findIndex((m) => m.id === modelConfig.id);
    if (existingIdx >= 0) {
      models[existingIdx] = modelConfig;
    } else {
      models.push(modelConfig);
    }
    store.set("models", models);
    store.set("activeModelId", modelConfig.id);

    if (claudeAgentInstance) {
      await claudeAgentInstance.switchModel(modelConfig);
    } else {
      claudeAgentInstance = new ClaudeAgentManager();
      await claudeAgentInstance.initialize(modelConfig);
    }
  }

  ipcMain.handle(
    "gateway:update",
    async (_event, profileId: string, updates: Partial<GatewayProfile>) => {
      const profiles = store.get("gatewayProfiles") as GatewayProfile[];
      const index = profiles.findIndex((p) => p.id === profileId);
      if (index === -1) return { success: false, error: "Gateway not found" };
      profiles[index] = {
        ...profiles[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      store.set("gatewayProfiles", profiles);
      // 如果更新的是活跃网关，同步 ModelConfig 并重新初始化 agent
      await syncActiveGatewayModel(profileId);
      return { success: true, data: profiles[index] };
    },
  );

  ipcMain.handle("gateway:delete", (_event, profileId: string) => {
    const profiles = store.get("gatewayProfiles") as GatewayProfile[];
    const filtered = profiles.filter((p) => p.id !== profileId);
    store.set("gatewayProfiles", filtered);
    if (store.get("activeGatewayId") === profileId) {
      store.set("activeGatewayId", null);
    }
    return { success: true };
  });

  ipcMain.handle("gateway:setActive", async (_event, profileId: string) => {
    const profiles = store.get("gatewayProfiles") as GatewayProfile[];
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return { success: false, error: "Gateway not found" };

    // Deactivate all profiles, activate the selected one
    const updated = profiles.map((p) => ({
      ...p,
      enabled: p.id === profileId,
    }));
    store.set("gatewayProfiles", updated);
    store.set("activeGatewayId", profileId);

    // 复用 syncActiveGatewayModel 创建 ModelConfig 并初始化 agent
    await syncActiveGatewayModel(profileId);

    return { success: true, data: updated.find((p) => p.id === profileId) };
  });

  ipcMain.handle("gateway:deactivate", async () => {
    const profiles = store.get("gatewayProfiles") as GatewayProfile[];
    store.set(
      "gatewayProfiles",
      profiles.map((p) => ({ ...p, enabled: false })),
    );
    store.set("activeGatewayId", null);
    store.set("activeModelId", null);
    // Destroy agent instance
    if (claudeAgentInstance) {
      try {
        await claudeAgentInstance.abort();
      } catch {}
      claudeAgentInstance = null;
    }
    return { success: true };
  });

  ipcMain.handle(
    "gateway:testConnection",
    async (_event, profile: Partial<GatewayProfile>) => {
      try {
        const url = profile.baseUrl || "https://api.anthropic.com";
        const startTime = Date.now();

        // 根据 apiFormat 选择合适的测试端点
        const apiFormat = profile.apiFormat || (
          (profile.type === "third-party" && profile.provider !== "deepseek")
            ? "openai" : "anthropic"
        );

        let testUrl = url;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (profile.type === "local") {
          testUrl = `${url.replace(/\/$/, "")}/api/tags`;
        } else if (apiFormat === "anthropic") {
          testUrl = `${url.replace(/\/$/, "")}/v1/messages`;
          if (profile.apiKey) {
            headers["x-api-key"] = profile.apiKey;
            headers["anthropic-version"] = "2023-06-01";
          }
        } else {
          // OpenAI 兼容格式
          testUrl = `${url.replace(/\/$/, "")}/models`;
          if (profile.apiKey) {
            headers["Authorization"] = `Bearer ${profile.apiKey}`;
          }
        }

        const fetchOptions: RequestInit = { method: "GET", headers };
        const effectiveProxy = resolveProxy(profile.proxy);
        if (effectiveProxy) {
          (fetchOptions as any).proxy = buildProxyOption(effectiveProxy);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        fetchOptions.signal = controller.signal;

        const response = await fetch(testUrl, fetchOptions);
        clearTimeout(timeout);

        if (response.ok || response.status === 401) {
          return { success: true, latency: Date.now() - startTime };
        }
        return { success: true, latency: Date.now() - startTime };
      } catch (error: any) {
        if (error.name === "AbortError") {
          return { success: false, error: "连接超时（10秒）" };
        }
        return { success: false, error: String(error.message || error) };
      }
    },
  );

  ipcMain.handle(
    "gateway:pullModels",
    async (_event, profile: Partial<GatewayProfile>) => {
      try {
        const url = profile.baseUrl || "";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        // 根据 apiFormat 选择拉取模型的端点
        const apiFormat = profile.apiFormat || (
          (profile.type === "third-party" && profile.provider !== "deepseek")
            ? "openai" : "anthropic"
        );

        let modelsEndpoint = url;
        if (profile.type === "local") {
          modelsEndpoint = `${url.replace(/\/$/, "")}/api/tags`;
        } else if (apiFormat === "anthropic") {
          modelsEndpoint = `${url.replace(/\/$/, "")}/v1/models`;
          if (profile.apiKey) {
            headers["x-api-key"] = profile.apiKey;
            headers["anthropic-version"] = "2023-06-01";
          }
        } else {
          modelsEndpoint = `${url.replace(/\/$/, "")}/models`;
          if (profile.apiKey) {
            headers["Authorization"] = `Bearer ${profile.apiKey}`;
          }
        }

        const fetchOptions: RequestInit = { method: "GET", headers };
        const effectiveProxy = resolveProxy(profile.proxy);
        if (effectiveProxy) {
          (fetchOptions as any).proxy = buildProxyOption(effectiveProxy);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        fetchOptions.signal = controller.signal;

        const response = await fetch(modelsEndpoint, fetchOptions);
        clearTimeout(timeout);

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` };
        }

        const data: any = await response.json();
        let models: string[] = [];

        // Parse model list from different API response formats
        if (profile.type === "local") {
          // Ollama: { models: [{ name: "llama3" }, ...] }
          models = (data.models || []).map((m: any) => m.name);
        } else if (data.data && Array.isArray(data.data)) {
          // OpenAI-compatible: { data: [{ id: "gpt-4o" }, ...] }
          models = data.data.map((m: any) => m.id || m);
        } else if (data.models && Array.isArray(data.models)) {
          models = data.models.map((m: any) => m.id || m.name || m);
        } else {
          return { success: false, error: "无法解析模型列表" };
        }

        return { success: true, models };
      } catch (error: any) {
        if (error.name === "AbortError") {
          return { success: false, error: "请求超时（15秒）" };
        }
        return { success: false, error: String(error.message || error) };
      }
    },
  );

  // ==========================================
  // 用量统计
  // ==========================================
  ipcMain.handle("usage:getStats", () => {
    const raw = store.get("usageStats") || {};
    return {
      totalTokens: 0,
      totalRequests: 0,
      dailyStats: [],
      gatewayStats: {},
      ...raw,
    };
  });

  ipcMain.handle(
    "usage:updateStats",
    (
      _event,
      data: {
        tokens: number;
        requests: number;
        gatewayId?: string;
        gatewayName?: string;
      },
    ) => {
      const raw = store.get("usageStats") || {};
      const current: UsageStats = {
        totalTokens: 0,
        totalRequests: 0,
        dailyStats: [],
        gatewayStats: {},
        ...raw,
      };

      const today = new Date().toISOString().slice(0, 10);

      // 更新总计
      current.totalTokens += data.tokens;
      current.totalRequests += data.requests;

      // 更新总每日统计
      let todayTotal = current.dailyStats.find((d) => d.date === today);
      if (todayTotal) {
        todayTotal.tokens += data.tokens;
        todayTotal.requests += data.requests;
      } else {
        current.dailyStats.push({
          date: today,
          tokens: data.tokens,
          requests: data.requests,
        });
      }

      // 更新网关维度统计
      if (data.gatewayId) {
        if (!current.gatewayStats[data.gatewayId]) {
          current.gatewayStats[data.gatewayId] = {
            gatewayId: data.gatewayId,
            gatewayName: data.gatewayName || data.gatewayId,
            totalTokens: 0,
            totalRequests: 0,
            dailyStats: [],
          };
        }
        const gw = current.gatewayStats[data.gatewayId];
        gw.gatewayName = data.gatewayName || gw.gatewayName;
        gw.totalTokens += data.tokens;
        gw.totalRequests += data.requests;

        let gwToday = gw.dailyStats.find((d) => d.date === today);
        if (gwToday) {
          gwToday.tokens += data.tokens;
          gwToday.requests += data.requests;
        } else {
          gw.dailyStats.push({
            date: today,
            tokens: data.tokens,
            requests: data.requests,
          });
        }
      }

      store.set("usageStats", current);

      // 同步写入记忆系统的用量日志
      try {
        const { getAgentSystem } = require("./agent-ipc.js");
        const sys = getAgentSystem();
        if (sys?.memoryManager?.isInitialized()) {
          sys.memoryManager.logUsage(
            data.gatewayId,
            data.gatewayName,
            data.tokens,
            data.requests,
          );
        }
      } catch { /* 记忆系统不可用时静默降级 */ }

      return { success: true };
    },
  );

  // ==========================================
  // 会话管理
  // ==========================================
  ipcMain.handle("sessions:getAll", () => {
    return store.get("sessions");
  });

  ipcMain.handle("sessions:create", (_event, session: SessionData) => {
    const sessions = store.get("sessions") as SessionData[];
    session.id = session.id || `session_${Date.now()}`;
    session.createdAt = session.createdAt || new Date().toISOString();
    session.updatedAt = new Date().toISOString();
    sessions.push(session);
    store.set("sessions", sessions);
    store.set("activeSessionId", session.id);
    return { success: true, data: session };
  });

  ipcMain.handle("sessions:delete", (_event, sessionId: string) => {
    const sessions = store.get("sessions") as SessionData[];
    const filtered = sessions.filter((s) => s.id !== sessionId);
    store.set("sessions", filtered);
    if (store.get("activeSessionId") === sessionId) {
      const nextSession = filtered.length > 0 ? filtered[0]?.id || null : null;
      store.set("activeSessionId", nextSession);
    }
    return { success: true };
  });

  ipcMain.handle("sessions:archive", (_event, sessionId: string) => {
    const sessions = store.get("sessions") as SessionData[];
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      session.archived = true;
      session.updatedAt = new Date().toISOString();
      store.set("sessions", sessions);
    }
    return { success: true };
  });

  ipcMain.handle("sessions:setActive", (_event, sessionId: string) => {
    store.set("activeSessionId", sessionId);
    return { success: true };
  });

  ipcMain.handle("sessions:getActive", () => {
    const activeId = store.get("activeSessionId");
    const sessions = store.get("sessions") as SessionData[];
    return sessions.find((s) => s.id === activeId) || null;
  });

  ipcMain.handle(
    "sessions:addMessage",
    (_event, sessionId: string, message: ChatMessage) => {
      const sessions = store.get("sessions") as SessionData[];
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        if (!session.messages) session.messages = [];
        session.messages.push(message);
        session.updatedAt = new Date().toISOString();
        store.set("sessions", sessions);
        return { success: true };
      }
      return { success: false, error: "Session not found" };
    },
  );

  ipcMain.handle(
    "sessions:updateMessageContent",
    (_event, sessionId: string, messageId: string, content: string) => {
      const sessions = store.get("sessions") as SessionData[];
      const session = sessions.find((s) => s.id === sessionId);
      if (session && session.messages) {
        const msg = session.messages.find((m) => m.id === messageId);
        if (msg) {
          msg.content = content;
          session.updatedAt = new Date().toISOString();
          store.set("sessions", sessions);
          return { success: true };
        }
      }
      return { success: false, error: "Message not found" };
    },
  );

  ipcMain.handle(
    "sessions:update",
    (_event, sessionId: string, updates: Partial<SessionData>) => {
      const sessions = store.get("sessions") as SessionData[];
      const index = sessions.findIndex((s) => s.id === sessionId);
      if (index === -1) return { success: false, error: "Session not found" };
      sessions[index] = { ...sessions[index], ...updates, updatedAt: new Date().toISOString() };
      store.set("sessions", sessions);
      return { success: true, data: sessions[index] };
    },
  );

  // ==========================================
  // 项目管理
  // ==========================================
  ipcMain.handle("projects:getRecent", () => {
    return store.get("recentProjects") || [];
  });

  ipcMain.handle("projects:addRecent", (_event, projectPath: string) => {
    const recent = store.get("recentProjects") as string[];
    const filtered = recent.filter((p) => p !== projectPath);
    const updated = [projectPath, ...filtered].slice(0, 20);
    store.set("recentProjects", updated);
    return { success: true };
  });

  ipcMain.handle("projects:removeRecent", (_event, projectPath: string) => {
    const recent = store.get("recentProjects") as string[];
    store.set(
      "recentProjects",
      recent.filter((p) => p !== projectPath),
    );
    return { success: true };
  });

  // ==========================================
  // 预览 URL 历史
  // ==========================================
  ipcMain.handle("preview:getUrlHistory", () => {
    return store.get("previewUrlHistory") || [];
  });

  ipcMain.handle("preview:setUrlHistory", (_event, history: string[]) => {
    store.set("previewUrlHistory", history.slice(0, 20));
    return { success: true };
  });

  ipcMain.handle(
    "projects:getSessionsByProject",
    (_event, projectPath: string) => {
      const sessions = store.get("sessions") as SessionData[];
      return sessions.filter((s) => s.projectPath === projectPath);
    },
  );

  // ==========================================
  // Claude Agent SDK 相关（流式输出）
  // ==========================================
  ipcMain.handle(
    "agent:sendMessage",
    async (_event, params: { message: string; cwd?: string; annotations?: AnnotationContext[]; history?: Array<{role: string; content: string}> }) => {
      if (!claudeAgentInstance) {
        return { success: false, error: "Agent not initialized" };
      }
      try {
        let fullMessage = params.message;
        let augmentedHistory = params.history;

        // 标签上下文解析：将 [skill:xxx]、[mcp:xxx] 等标签解析为实际指令
        try {
          const { resolveTagContext } = await import("./agent-ipc.js");
          fullMessage = await resolveTagContext(fullMessage);
        } catch {
          // 标签解析失败时静默降级
        }

        // RAG 增强：如果记忆系统就绪且开启，检索相关记忆增强上下文
        try {
          const { getAgentSystem } = await import("./agent-ipc.js");
          const sys = getAgentSystem();
          if (sys?.memoryManager?.isInitialized()) {
            const memConfig = sys.memoryManager.getConfig();
            if (memConfig.enabled) {
              const activeSessionId = store.get("activeSessionId") as string | null;
              const { memories, tokenEstimate } = await sys.memoryManager.retrieveMemories(
                fullMessage,
                activeSessionId || undefined,
              );
              if (memories.length > 0 && tokenEstimate > 0) {
                const memContext = memories.map((m: any) =>
                  `[${new Date(m.timestamp).toLocaleString("zh-CN")}] ${m.summary || m.content?.slice(0, 200)}`
                ).join("\n");
                const ragSystemMsg = {
                  role: "user" as const,
                  content: `【历史相关记忆（向量检索）】\n以下是与当前问题相关的历史对话记忆：\n${memContext}\n\n请参考以上历史记忆回答当前问题。`,
                };
                augmentedHistory = [...(params.history || []), ragSystemMsg];
                console.log(`[RAG] 检索到 ${memories.length} 条相关记忆，约 ${tokenEstimate} tokens`);
              }
            }
          }
        } catch {
          // RAG 不可用时静默降级
        }

        // 120s 超时保护，防止 API 挂起导致 UI 卡死
        const TIMEOUT_MS = 120_000;
        const response = await Promise.race([
          claudeAgentInstance.sendMessageStream(
            fullMessage,
            {
              onStatus: (status: string) => {
                mainWindow?.webContents.send("agent:status", status);
              },
              onChunk: (text: string) => {
                mainWindow?.webContents.send("agent:chunk", text);
              },
              onToolUse: (toolName: string, input: Record<string, unknown>) => {
                console.log(`[Agent] onToolUse: ${toolName}`, JSON.stringify(input));
                mainWindow?.webContents.send("agent:tool-use", {
                  toolName,
                  input,
                });
              },
              onToolResult: (toolName: string, status: string) => {
                mainWindow?.webContents.send("agent:tool-result", {
                  toolName,
                  status,
                });
              },
              onError: (error: string) => {
                mainWindow?.webContents.send("agent:error", error);
              },
              onDone: (usage: { inputTokens: number; outputTokens: number }) => {
                mainWindow?.webContents.send("agent:done", usage);
              },
            },
            params.cwd,
            augmentedHistory,
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("API 请求超时 (120s)")), TIMEOUT_MS)
          ),
        ]);

        // 对话完成后，异步向量化存储到记忆系统
        try {
          const { getAgentSystem } = require("./agent-ipc.js");
          const sys = getAgentSystem();
          if (sys?.memoryManager?.isInitialized() && sys.memoryManager.getConfig().enabled) {
            // 从 electron-store 获取当前活跃会话的消息进行向量化
            const sessions = store.get("sessions") as SessionData[];
            const activeId = store.get("activeSessionId") as string | null;
            const activeSession = sessions.find((s: SessionData) => s.id === activeId);
            if (activeSession?.messages?.length) {
              const memMessages = activeSession.messages.map((m: ChatMessage) => ({
                id: m.id,
                sessionId: activeSession.id,
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
              }));
              // 确保会话存在于记忆系统
              sys.memoryManager.createSession(activeSession.id, activeSession.title);
              // 存储消息
              for (const msg of memMessages) {
                sys.memoryManager.addMessage(msg);
              }
              // 异步向量化
              sys.memoryManager.memorizeSessionMessages(activeSession.id, memMessages)
                .then(() => console.log("[RAG] 会话已向量化存储"))
                .catch((err: any) => console.error("[RAG] 向量化失败:", err));
            }
          }
        } catch { /* 静默 */ }

        return { success: true, data: response };
      } catch (error) {
        mainWindow?.webContents.send("agent:error", String(error));
        return { success: false, error: String(error) };
      }
    },
  );

  ipcMain.handle("agent:init", async () => {
    try {
      const models = store.get("models") as ModelConfig[];
      const activeId = store.get("activeModelId") as string | null;
      const activeModel = models.find((m) => m.id === activeId);
      if (activeModel) {
        if (claudeAgentInstance) {
          await claudeAgentInstance.switchModel(activeModel);
        } else {
          claudeAgentInstance = new ClaudeAgentManager();
          await claudeAgentInstance.initialize(activeModel);
        }
      }

      // 将可用技能列表注入 agent system prompt，让 agent 感知技能
      try {
        const { buildAvailableSkillsMd, setOnSkillsChanged, getAgentSystem } = await import("./agent-ipc.js");
        if (claudeAgentInstance) {
          claudeAgentInstance.setAvailableSkillsMd(buildAvailableSkillsMd());
          // 注入 MCP 客户端（使 agent 可调用 MCP 工具）
          const agentSys = getAgentSystem();
          if (agentSys) {
            claudeAgentInstance.setMCPClient(agentSys.mcpClient);
            // 模型切换后更新 Embedding 提供者（用记忆系统独立配置）
            if (agentSys.memoryManager.isInitialized()) {
              const savedMemCfg = store.get("memoryConfig") || {};
              const embBaseUrl = savedMemCfg.embeddingBaseUrl || "https://api.openai.com/v1";
              const embModel = savedMemCfg.embeddingModel || "text-embedding-3-small";
              let embApiKey = savedMemCfg.embeddingApiKey || "";
              if (!embApiKey && activeModel?.apiKey) embApiKey = activeModel.apiKey;
              agentSys.memoryManager.configureEmbedding({
                baseUrl: embBaseUrl,
                apiKey: embApiKey || undefined,
                model: embModel,
              });
            }
          }
          // 注册技能变更回调，自动更新 system prompt
          setOnSkillsChanged(() => {
            if (claudeAgentInstance) {
              claudeAgentInstance.setAvailableSkillsMd(buildAvailableSkillsMd());
            }
          });
        }
      } catch { /* agent 系统未就绪时静默忽略 */ }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("agent:abort", async () => {
    if (claudeAgentInstance) {
      await claudeAgentInstance.abort();
    }
    return { success: true };
  });

  // ==========================================
  // 主题设置
  // ==========================================
  ipcMain.handle("theme:get", () => {
    return store.get("theme") || "dark";
  });

  ipcMain.handle("theme:set", (_event, theme: "light" | "dark") => {
    store.set("theme", theme);
    return { success: true };
  });

  // ==========================================
  // 应用配置
  // ==========================================
  ipcMain.handle("app:getConfig", () => {
    return store.store;
  });

  ipcMain.handle("app:getAppConfig", () => {
    return store.get("appConfig") || { fontSize: 14, autoLaunch: false };
  });

  ipcMain.handle("app:updateAppConfig", (_event, config: Partial<{ fontSize: number; autoLaunch: boolean }>) => {
    const current = store.get("appConfig") || { fontSize: 14, autoLaunch: false };
    const merged = { ...current, ...config };
    store.set("appConfig", merged);

    // 实际设置开机自启
    if (config.autoLaunch !== undefined) {
      app.setLoginItemSettings({
        openAtLogin: config.autoLaunch,
        openAsHidden: true,
      });
    }

    return { success: true };
  });

  ipcMain.handle("app:getProxy", () => {
    return store.get("globalProxy") || null;
  });

  ipcMain.handle("app:setProxy", (_event, proxy: ProxyConfig | null) => {
    store.set("globalProxy", proxy);
    return { success: true };
  });

  ipcMain.handle("app:testProxy", async (_event, proxy: ProxyConfig) => {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("https://httpbin.org/ip", {
        method: "GET",
        signal: controller.signal,
        proxy: buildProxyOption(proxy),
      } as any);
      clearTimeout(timeout);
      const data: any = await res.json().catch(() => ({}));
      const origin = data?.origin || "未知";
      return { success: true, latency: Date.now() - startTime, status: res.status, ip: origin };
    } catch (err: any) {
      const msg = err.name === "AbortError"
        ? "连接超时，请检查代理地址和端口是否正确"
        : (err.message || String(err));
      return { success: false, error: msg, latency: Date.now() - startTime };
    }
  });

  ipcMain.handle("app:getDataPath", () => {
    return app.getPath("userData");
  });

  ipcMain.handle("app:getVersion", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:clearCache", async () => {
    // 保留网关配置和会话数据，清除用量统计和日志
    store.set("usageStats", { totalTokens: 0, totalRequests: 0, dailyStats: [], gatewayStats: {} });
    return { success: true };
  });
}

/**
 * 注入 DOM 检查器脚本到预览页面
 * 用于实现元素标注功能
 */
function injectDomInspectorScript(): string {
  return `
    (function() {
      if (window.__domInspectorInjected) return;
      window.__domInspectorInjected = true;

      let annotationMode = false;
      var __mcTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      const highlights = new Map();
      let highlightBox = null;
      let highlightLabel = null;
      let currentHoverEl = null;
      let idCounter = 0;

      function createOverlay() {
        highlightBox = document.createElement('div');
        highlightBox.id = '__mc_highlight';
        highlightBox.style.cssText = 'position:fixed;pointer-events:none;z-index:999998;border:2px solid #f59e0b;background:rgba(245,158,11,0.08);display:none;transition:none;';
        document.body.appendChild(highlightBox);

        highlightLabel = document.createElement('div');
        highlightLabel.id = '__mc_label';
        highlightLabel.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;background:#f59e0b;color:#fff;font-size:11px;font-family:monospace;padding:2px 6px;border-radius:3px;white-space:nowrap;display:none;line-height:1.4;';
        document.body.appendChild(highlightLabel);
      }

      // —— 从深层子元素找到更合适的标注目标 ——
      function findHoverTarget(el) {
        if (!el || el === document.body || el === document.documentElement) return null;
        if (el.id && el.id.startsWith('__mc_')) return null;
        // 如果元素本身或任意父级已被标注，返回那个已标注元素
        var p = el;
        while (p && p !== document.body) {
          if (highlights.has(p)) return p;
          p = p.parentElement;
        }
        // 默认返回最深层原始元素（由 e.target 传入）
        return el;
      }

      function getElementInfo(el) {
        const rect = el.getBoundingClientRect();

        // 临时清除标注模式添加的样式（outline, cursor），避免污染发送给 agent 的样式数据
        var savedOutline = el.style.outline;
        var savedCursor = el.style.cursor;
        if (el.__mcSavedCursor !== undefined) {
          el.style.cursor = el.__mcSavedCursor;
        } else {
          el.style.cursor = '';
        }
        if (el.__savedOutline !== undefined) {
          el.style.outline = el.__savedOutline;
        } else {
          el.style.outline = '';
        }

        const styles = window.getComputedStyle(el);

        // ★ 在恢复标注样式之前读取 attributes，确保 style 不带标注污染
        var cleanAttributes = Array.from(el.attributes).map(function(a) {
          return { name: a.name, value: a.value };
        });

        // 恢复标注样式
        el.style.outline = savedOutline;
        el.style.cursor = savedCursor;
        const selectors = [];
        let current = el;
        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();
          if (current.id) { selector = '#' + current.id; selectors.unshift(selector); break; }
          if (current.className && typeof current.className === 'string') {
            const cls = current.className.trim().split(/\\s+/).filter(Boolean);
            if (cls.length > 0) selector += '.' + cls.join('.');
          }
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(s => s.tagName === current.tagName);
            if (siblings.length > 1) selectors.unshift(selector + ':nth-child(' + (siblings.indexOf(current) + 1) + ')');
            else selectors.unshift(selector);
          } else { selectors.unshift(selector); }
          current = current.parentElement;
        }

        // —— 从 React / Vue fiber 抓取源码路径和行号 ——
        var sourceFile = null, sourceLine = null, sourceColumn = null, componentStack = null;
        var debugInfo = {};
        try {
          // React fiber: 先从当前元素找，如果找不到则向上遍历父级
          var fiberEl = el;
          var fiberKey = null;
          while (fiberEl && fiberEl !== document.body && fiberEl !== document.documentElement) {
            fiberKey = Object.keys(fiberEl).find(function(k) { return k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'); });
            if (fiberKey) break;
            fiberEl = fiberEl.parentElement;
          }
          debugInfo['fiberFound'] = !!fiberKey;
          debugInfo['fiberElTag'] = fiberEl ? fiberEl.tagName : null;
          if (fiberKey) {
            var rootFiber = fiberEl[fiberKey];
            var stack = [];

            // ---- 调试：dump _debugInfo 和 _debugStack 的实际格式 ----
            var debugInfoSample = {};
            if (rootFiber._debugInfo && rootFiber._debugInfo.length > 0) {
              debugInfoSample['_debugInfoCount'] = rootFiber._debugInfo.length;
              debugInfoSample['_debugInfoEntryKeys'] = Object.keys(rootFiber._debugInfo[0]);
              var firstEntry = rootFiber._debugInfo[0];
              if (firstEntry.source) {
                debugInfoSample['_debugInfoSourceKeys'] = Object.keys(firstEntry.source);
                debugInfoSample['_debugInfoSourceFileName'] = firstEntry.source.fileName;
              } else {
                debugInfoSample['_debugInfoNoSource'] = true;
              }
            } else {
              debugInfoSample['_debugInfoAbsent'] = true;
            }
            if (rootFiber._debugStack) {
              debugInfoSample['_debugStackType'] = typeof rootFiber._debugStack;
              debugInfoSample['_debugStackPreview'] = String(rootFiber._debugStack).substring(0, 500);
            } else {
              debugInfoSample['_debugStackAbsent'] = true;
            }
            // 额外检查可能有源码信息的属性
            var extraProps = ['_debugOwner', '_debugNearestBounds', '_debugHookTypes'];
            debugInfoSample['_extraProps'] = {};
            for (var ei = 0; ei < extraProps.length; ei++) {
              var pn = extraProps[ei];
              if (rootFiber[pn] !== undefined) {
                debugInfoSample['_extraProps'][pn] = typeof rootFiber[pn];
              }
            }
            debugInfo['debugSample'] = debugInfoSample;

            // 从 fiber 中提取源码信息的通用函数（支持 React 17/18 的 _debugSource 和 React 19 的 _debugInfo）
            function extractFiberSource(fiber) {
              // React 19+: _debugInfo 数组中包含 source 信息
              if (fiber._debugInfo && fiber._debugInfo.length > 0) {
                for (var di = 0; di < fiber._debugInfo.length; di++) {
                  var entry = fiber._debugInfo[di];
                  if (entry.source && entry.source.fileName) {
                    return { source: entry.source.fileName, line: entry.source.lineNumber, col: entry.source.columnNumber };
                  }
                }
              }
              // React 17/18: _debugSource 上直接有 fileName
              if (fiber._debugSource) {
                return { source: fiber._debugSource.fileName || fiber._debugSource.file, line: fiber._debugSource.lineNumber || fiber._debugSource.line, col: fiber._debugSource.columnNumber || fiber._debugSource.column };
              }
              return null;
            }

            // 从 _debugStack 中解析文件路径（React 19 fallback）
            // React 19 的 _debugStack 是一个 Error 对象，需要取其 .stack 属性
            // 注意模板字符串中的正则需要 \\s 产生 \s, \\( 产生 \(
            function extractFromDebugStack(fiber) {
              var stackStr = null;
              if (fiber._debugStack) {
                if (typeof fiber._debugStack === 'string') {
                  stackStr = fiber._debugStack;
                } else if (typeof fiber._debugStack === 'object' && fiber._debugStack.stack) {
                  // React 19: _debugStack 是 Error 对象，.stack 是实际堆栈字符串
                  stackStr = fiber._debugStack.stack;
                } else {
                  // 最后的 fallback
                  try { stackStr = String(fiber._debugStack); } catch(e) {}
                }
              }
              if (stackStr) {
                // 逐行解析堆栈
                var lines = stackStr.split('\\n');
                for (var li = 0; li < lines.length; li++) {
                  var line = lines[li].trim();
                  // 匹配 "at ComponentName (path:line:col)" 格式
                  var parenMatch = line.match(/^\\s*at\\s+\\S+\\s+\\((.+)\\)\\s*$/);
                  if (parenMatch) {
                    var path = parenMatch[1].trim();
                    // 清理 webpack 前缀
                    path = path.replace(/^webpack-internal:\\/\\/\\/+/i, '').replace(/^webpack:\\/\\/\\/+/i, '').replace(/^file:\\/\\/\\//, '');
                    // 过滤掉非文件路径
                    if (/\\.(js|tsx|ts|jsx)([:?\\d]|$)/i.test(path) && path.indexOf('node_modules') === -1 && path.indexOf('/webpack/') === -1) {
                      var lineMatch = path.match(/(\\d+):(\\d+)$/);
                      return {
                        source: path.replace(/:\\d+:\\d+$/, '').replace(/:\\d+$/, ''),
                        line: lineMatch ? parseInt(lineMatch[1]) : null,
                        col: lineMatch ? parseInt(lineMatch[2]) : null
                      };
                    }
                  }
                  // 直接匹配路径（不在括号内的格式）
                  var rawMatch = line.match(/(webpack-internal:\\/\\/\\/+|webpack:\\/\\/\\/+|file:\\/\\/\\/)?([^\\s]+\\.(js|tsx|ts|jsx)(:\\d+)?(:\\d+)?)/i);
                  if (rawMatch) {
                    var path = (rawMatch[1] || '') + rawMatch[2];
                    path = path.replace(/^webpack-internal:\\/\\/\\/+/i, '').replace(/^webpack:\\/\\/\\/+/i, '').replace(/^file:\\/\\/\\//, '');
                    if (path.indexOf('node_modules') === -1 && path.indexOf('/webpack/') === -1) {
                      var lineMatch = path.match(/(\\d+):(\\d+)$/);
                      return {
                        source: path.replace(/:\\d+:\\d+$/, '').replace(/:\\d+$/, ''),
                        line: lineMatch ? parseInt(lineMatch[1]) : null,
                        col: lineMatch ? parseInt(lineMatch[2]) : null
                      };
                    }
                  }
                }
              }
              return null;
            }

            // 策略0: 专门走 owner 链检查 _debugInfo（host fiber 没有 _debugInfo，但 owner 组件 fiber 可能有）
            if (!sourceFile && rootFiber._debugOwner) {
              var o0 = rootFiber._debugOwner;
              var od0 = 0;
              while (o0 && od0 < 10 && !sourceFile) {
                // 检查 owner 的 _debugInfo
                if (o0._debugInfo && o0._debugInfo.length > 0) {
                  for (var di0 = 0; di0 < o0._debugInfo.length; di0++) {
                    var entry0 = o0._debugInfo[di0];
                    if (entry0.source && entry0.source.fileName) {
                      sourceFile = entry0.source.fileName;
                      sourceLine = entry0.source.lineNumber;
                      sourceColumn = entry0.source.columnNumber;
                      debugInfo['foundIn'] = 'strategy0';
                      debugInfo['rawPath'] = sourceFile;
                    }
                  }
                }
                if (!sourceFile) {
                  var srcInfo0 = extractFromDebugStack(o0);
                  if (srcInfo0) {
                    sourceFile = srcInfo0.source;
                    sourceLine = srcInfo0.line;
                    sourceColumn = srcInfo0.col;
                    debugInfo['foundIn'] = 'strategy0_stack';
                    debugInfo['rawPath'] = sourceFile;
                  }
                }
                od0++; o0 = o0._debugOwner;
              }
            }

            // 策略1: 走 parent 链（fiber.return），每层同时查 owner 链和 _debugInfo
            var f = rootFiber;
            while (f && stack.length < 20) {
              // 检查当前 fiber 的源码信息
              var srcInfo = extractFiberSource(f);
              // 查 owner 链
              if (!srcInfo && f._debugOwner) {
                var o2 = f._debugOwner;
                var od = 0;
                while (o2 && od < 5 && !srcInfo) {
                  srcInfo = extractFiberSource(o2);
                  od++; o2 = o2._debugOwner;
                }
              }
              // 从 _debugStack fallback
              if (!srcInfo) {
                srcInfo = extractFromDebugStack(f);
              }
              // 收集组件名
              var type = f.elementType || f.type;
              var compName = '';
              if (typeof type === 'function') { compName = type.displayName || type.name || ''; }
              else if (typeof type === 'object' && type) { compName = type.displayName || type.name || ''; }
              if (compName) { var n = compName.trim(); if (n && !stack.includes(n)) stack.push(n); }
              // 提取源码路径
              if (srcInfo && !sourceFile) {
                sourceFile = srcInfo.source;
                sourceLine = srcInfo.line;
                sourceColumn = srcInfo.col;
                debugInfo['foundIn'] = 'strategy1';
                debugInfo['rawPath'] = sourceFile;
              }
              f = f.return;
            }

            // 策略2: 独立走 owner 链
            if (!sourceFile && rootFiber._debugOwner) {
              var o = rootFiber._debugOwner;
              var od = 0;
              while (o && od < 20 && !sourceFile) {
                var srcInfo = extractFiberSource(o);
                if (!srcInfo) srcInfo = extractFromDebugStack(o);
                if (srcInfo) {
                  sourceFile = srcInfo.source;
                  sourceLine = srcInfo.line;
                  sourceColumn = srcInfo.col;
                  debugInfo['foundIn'] = 'strategy2';
                  debugInfo['rawPath'] = sourceFile;
                }
                var type = o.elementType || o.type;
                var compName = '';
                if (typeof type === 'function') { compName = type.displayName || type.name || ''; }
                else if (typeof type === 'object' && type) { compName = type.displayName || type.name || ''; }
                if (compName) { var n = compName.trim(); if (n && !stack.includes(n)) stack.push(n); }
                o = o._debugOwner;
                od++;
              }
            }
            if (stack.length > 0) componentStack = stack;
          }
          // Vue 3 / Vue 2
          if (!sourceFile) {
            var vueComp = el.__vueParentComponent || el.__vue__;
            if (vueComp) {
              var vtype = vueComp.type || (vueComp.$options && vueComp.$options);
              if (vtype) {
                var vfile = vtype.__file || null;
                var vname = vtype.name || vtype.__name || null;
                if (vfile) sourceFile = vfile;
                if (vname) { componentStack = [vname]; }
                debugInfo['foundIn'] = 'vue';
                debugInfo['rawPath'] = sourceFile || null;
              }
            }
          }
        } catch(e) { debugInfo['error'] = String(e); }

        // —— 清理 webpack/vite 内部路径前缀，转换为本地文件路径 ——
        if (sourceFile) {
          debugInfo['beforeClean'] = sourceFile;
          sourceFile = sourceFile.replace(/^webpack-internal:\\/\\/\\/+/i, '').replace(/^webpack:\\/\\/\\/+/i, '');
          // 排除 React 内部模块 (react-dom, scheduler 等)
          if (sourceFile === '' || sourceFile.indexOf('node_modules') !== -1 || sourceFile.indexOf('webpack') !== -1) {
            debugInfo['filtered'] = sourceFile;
            sourceFile = null;
          }
          debugInfo['afterClean'] = sourceFile;
        }

        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          className: (typeof el.className === 'string') ? el.className : null,
          selector: selectors.join(' > '),
          textContent: (el.textContent || '').substring(0, 200),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          styles: {
            color: styles.color, backgroundColor: styles.backgroundColor,
            fontSize: styles.fontSize, fontFamily: styles.fontFamily, fontWeight: styles.fontWeight,
            lineHeight: styles.lineHeight, textAlign: styles.textAlign,
            display: styles.display, position: styles.position,
            margin: styles.margin, padding: styles.padding, border: styles.border,
            width: styles.width, height: styles.height,
            zIndex: styles.zIndex, opacity: styles.opacity, cursor: styles.cursor,
            overflow: styles.overflow, boxSizing: styles.boxSizing,
          },
          attributes: cleanAttributes,
          sourceFile: sourceFile,
          sourceLine: sourceLine,
          sourceColumn: sourceColumn,
          componentStack: componentStack,
          _debug: debugInfo,
        };
      }

      function doHighlight(el, id) {
        highlights.set(id, el);
        el.__savedOutline = el.style.outline;
        el.style.outline = '2px solid #f59e0b';
      }

      function doRemoveHighlight(id) {
        var el = highlights.get(id);
        if (el) {
          if (el.__savedOutline !== undefined) el.style.outline = el.__savedOutline;
          else el.style.outline = '';
          highlights.delete(id);
        }
      }

      window.__removeHighlight = doRemoveHighlight;

      function clearAllHighlights() {
        highlights.forEach(function(el, id) { doRemoveHighlight(id); });
      }
      window.__clearAllHighlights = clearAllHighlights;

      // 外部可调：根据标注 ID 滚动到元素并闪烁高亮
      window.__scrollToAnnotation = function(hid) {
        var el = highlights.get(hid);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var origBg = el.style.backgroundColor;
        var origTransition = el.style.transition;
        el.style.transition = 'background-color 0.3s';
        el.style.backgroundColor = 'rgba(245,158,11,0.35)';
        setTimeout(function() {
          el.style.backgroundColor = origBg;
          setTimeout(function() { el.style.transition = origTransition; }, 300);
        }, 2000);
      };

      // 立即创建高亮 DOM 元素（display:none），避免延迟创建时的时序问题
      createOverlay();

      window.addEventListener('message', function(event) {
        if (event.data.type === 'START_ANNOTATION_MODE') {
          annotationMode = true;
          if (event.data.theme) __mcTheme = event.data.theme;
        } else if (event.data.type === 'SET_THEME') {
          __mcTheme = event.data.theme || 'dark';
        } else if (event.data.type === 'STOP_ANNOTATION_MODE') {
          annotationMode = false;
          if (highlightBox) { highlightBox.style.display = 'none'; }
          if (highlightLabel) { highlightLabel.style.display = 'none'; }
          if (currentHoverEl) {
            currentHoverEl.style.cursor = currentHoverEl.__mcSavedCursor || '';
            delete currentHoverEl.__mcSavedCursor;
            currentHoverEl = null;
          }
        }
      });

      // —— 递归获取选择器标签文本 ——
      function buildLabel(el) {
        var label = el.tagName.toLowerCase();
        if (el.id) { label += '#' + el.id; }
        else if (el.className && typeof el.className === 'string') {
          var cls = el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2);
          if (cls.length > 0) label += '.' + cls.join('.');
        }
        var r = el.getBoundingClientRect();
        label += ' (' + Math.round(r.width) + '×' + Math.round(r.height) + ')';
        return label;
      }

      // —— 鼠标移入：高亮 + 标签（带 rAF 节流 + 智能目标选择） ——
      var _hoverRAF = null;
      document.addEventListener('mouseover', function(e) {
        if (!annotationMode) return;
        var target = findHoverTarget(e.target);
        if (!target) return;
        // 标注弹窗内保持默认光标，不改为 crosshair
        if (target.closest && target.closest('#__mc_popup')) return;
        // 页面内弹框/错误遮罩不捕获
        if (target.closest && target.closest('[role="dialog"], [role="alertdialog"], [role="alert"]')) return;

        // 已标注元素不变色（已有 outline），但仍显示标签
        if (highlights.has(target)) {
          if (currentHoverEl !== target) {
            if (currentHoverEl && highlightBox) highlightBox.style.display = 'none';
            currentHoverEl = target;
          }
          if (highlightLabel) {
            var _r = target.getBoundingClientRect();
            highlightLabel.textContent = buildLabel(target) + ' ✓已标注';
            var _ll = Math.max(0, Math.min(_r.left, window.innerWidth - 260));
            highlightLabel.style.left = _ll + 'px';
            highlightLabel.style.top = (_r.top - 24 < 0 ? _r.bottom + 4 : _r.top - 24) + 'px';
            highlightLabel.style.display = 'block';
          }
          return;
        }

        // 同元素不做重复处理
        if (target === currentHoverEl) return;

        // 恢复上一个元素的 cursor
        if (currentHoverEl) {
          if (currentHoverEl.__mcSavedCursor !== undefined) {
            currentHoverEl.style.cursor = currentHoverEl.__mcSavedCursor;
            delete currentHoverEl.__mcSavedCursor;
          }
        }

        currentHoverEl = target;
        target.__mcSavedCursor = target.style.cursor || '';
        target.style.cursor = 'crosshair';

        if (_hoverRAF) cancelAnimationFrame(_hoverRAF);
        _hoverRAF = requestAnimationFrame(function() {
          _hoverRAF = null;
          if (!currentHoverEl) return;
          var _r = currentHoverEl.getBoundingClientRect();
          if (highlightBox) {
            highlightBox.style.left = _r.left + 'px';
            highlightBox.style.top = _r.top + 'px';
            highlightBox.style.width = _r.width + 'px';
            highlightBox.style.height = _r.height + 'px';
            highlightBox.style.display = 'block';
          }
          if (highlightLabel) {
            highlightLabel.textContent = buildLabel(currentHoverEl);
            var _ll = Math.max(0, Math.min(_r.left, window.innerWidth - 260));
            highlightLabel.style.left = _ll + 'px';
            highlightLabel.style.top = (_r.top - 24 < 0 ? _r.bottom + 4 : _r.top - 24) + 'px';
            highlightLabel.style.display = 'block';
          }
        });
      });

      // —— 鼠标移出：清除高亮（检查 relatedTarget 避免误清除） ——
      document.addEventListener('mouseout', function(e) {
        if (!annotationMode) return;
        var target = findHoverTarget(e.target);
        if (!target) return;
        var rt = e.relatedTarget;
        // 移动到子元素或弹窗内，不清除
        if (rt && (target.contains(rt) || rt.id === '__mc_popup' || (rt.closest && rt.closest('#__mc_popup')))) return;
        // 恢复 cursor
        if (target.__mcSavedCursor !== undefined) {
          target.style.cursor = target.__mcSavedCursor;
          delete target.__mcSavedCursor;
        }
        if (currentHoverEl === target || (currentHoverEl && !currentHoverEl.contains(rt))) {
          currentHoverEl = null;
        }
        if (_hoverRAF) { cancelAnimationFrame(_hoverRAF); _hoverRAF = null; }
        if (highlightBox) highlightBox.style.display = 'none';
        if (highlightLabel) highlightLabel.style.display = 'none';
      });

      // —— 鼠标离开页面整体时清理 ——
      window.addEventListener('blur', function() {
        if (!annotationMode) return;
        if (currentHoverEl) {
          if (currentHoverEl.__mcSavedCursor !== undefined) {
            currentHoverEl.style.cursor = currentHoverEl.__mcSavedCursor;
          }
          currentHoverEl = null;
        }
        if (highlightBox) highlightBox.style.display = 'none';
        if (highlightLabel) highlightLabel.style.display = 'none';
      });

      // —— 标注点击弹窗（左键点击触发） ——
      document.addEventListener('click', function(e) {
        if (!annotationMode) return;

        // 不拦截弹窗内部点击
        if (e.target.closest && e.target.closest('#__mc_popup')) return;
        // 已标注元素的原生交互不受影响
        if (highlights.has(findHoverTarget(e.target))) return;

        // 不拦截页面内的弹框/错误遮罩（React error overlay 等），让用户能关掉
        if (e.target.closest && e.target.closest('[role="dialog"], [role="alertdialog"], [role="alert"]')) return;

        e.preventDefault();
        e.stopPropagation();

        // 暂隐悬停高亮
        if (highlightBox) highlightBox.style.display = 'none';
        if (highlightLabel) highlightLabel.style.display = 'none';

        var target = findHoverTarget(document.elementFromPoint(e.clientX, e.clientY));
        if (!target || target === document.body || target === document.documentElement) return;
        if (target.id === '__mc_popup' || target.id === '__mc_highlight' || target.id === '__mc_label') return;

        // 立即生成标注 ID 并高亮元素
        idCounter++;
        var hid = 'ann_' + idCounter;
        doHighlight(target, hid);

        try {
          var isDark = __mcTheme === 'dark';

          // —— 弹窗容器 ——
          var p = document.createElement('div');
          p.id = '__mc_popup';
          var ps = p.style;
          ps.position = 'fixed';
          ps.zIndex = '2147483647';
          ps.background = isDark ? '#1e293b' : '#ffffff';
          ps.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
          ps.borderRadius = '10px';
          ps.padding = '12px';
          ps.boxShadow = isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.12)';
          ps.fontFamily = 'sans-serif';
          ps.fontSize = '13px';
          ps.width = '280px';
          ps.cursor = 'auto';

          // 水平/垂直居中偏移
          var popupX = Math.min(e.clientX, window.innerWidth - 300);
          var popupY = Math.min(e.clientY + 5, window.innerHeight - 240);
          ps.left = popupX + 'px';
          ps.top = popupY + 'px';

          // —— 元素信息预览 ——
          var infoPreview = document.createElement('div');
          infoPreview.textContent = buildLabel(target);
          var ips = infoPreview.style;
          ips.fontSize = '11px';
          ips.color = isDark ? '#94a3b8' : '#64748b';
          ips.marginBottom = '8px';
          ips.overflow = 'hidden';
          ips.textOverflow = 'ellipsis';
          ips.whiteSpace = 'nowrap';

          // —— 多行文本输入 ——
          var ta = document.createElement('textarea');
          ta.placeholder = '输入标注文本...';
          ta.rows = 3;
          var tas = ta.style;
          tas.display = 'block';
          tas.width = '100%';
          tas.boxSizing = 'border-box';
          tas.padding = '8px 10px';
          tas.fontSize = '13px';
          tas.fontFamily = 'sans-serif';
          tas.lineHeight = '1.5';
          tas.border = isDark ? '1px solid #475569' : '1px solid #cbd5e1';
          tas.borderRadius = '6px';
          tas.background = isDark ? '#0f172a' : '#f8fafc';
          tas.color = isDark ? '#e2e8f0' : '#1e293b';
          tas.outline = 'none';
          tas.resize = 'vertical';
          tas.marginBottom = '10px';

          // —— 按钮行 ——
          var btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

          var closeBtn = document.createElement('button');
          closeBtn.textContent = '取消';
          closeBtn.type = 'button';
          var cbs = closeBtn.style;
          cbs.padding = '6px 14px';
          cbs.fontSize = '12px';
          cbs.border = isDark ? '1px solid #475569' : '1px solid #cbd5e1';
          cbs.borderRadius = '5px';
          cbs.background = 'transparent';
          cbs.color = isDark ? '#94a3b8' : '#64748b';
          cbs.cursor = 'pointer';

          var saveBtn = document.createElement('button');
          saveBtn.textContent = '保存';
          saveBtn.type = 'button';
          var sbs = saveBtn.style;
          sbs.padding = '6px 14px';
          sbs.fontSize = '12px';
          sbs.fontWeight = '600';
          sbs.border = 'none';
          sbs.borderRadius = '5px';
          sbs.background = '#f59e0b';
          sbs.color = '#1e293b';
          sbs.cursor = 'pointer';

          btnRow.appendChild(closeBtn);
          btnRow.appendChild(saveBtn);

          p.appendChild(infoPreview);
          p.appendChild(ta);
          p.appendChild(btnRow);
          document.body.appendChild(p);

          // 自动聚焦
          ta.focus();

          // —— 保存逻辑 — 高亮已存在，只需发送标注数据 ——
          var doSave = function() {
            var text = ta.value.trim();
            if (!text) return;
            var info = getElementInfo(target);
            info.pageUrl = window.location.href;
            info.pageTitle = document.title;
            console.log('__ANN__:' + JSON.stringify({
              type: 'annotation-note',
              data: { elementInfo: info, text: text, highlightId: hid }
            }));
            if (outsideHandler) document.removeEventListener('click', outsideHandler, true);
            p.remove();
          };

          // —— 关闭逻辑 — 取消时移除高亮 ——
          var outsideHandler = null;
          var doClose = function() {
            doRemoveHighlight(hid);
            if (outsideHandler) document.removeEventListener('click', outsideHandler, true);
            if (p && p.parentNode) p.remove();
          };

          // Enter 保存（Shift+Enter 换行）
          ta.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter' && !ev.shiftKey) {
              ev.preventDefault();
              doSave();
            } else if (ev.key === 'Escape') {
              ev.preventDefault();
              doClose();
            }
          });

          saveBtn.addEventListener('click', function(ev) { ev.stopPropagation(); doSave(); });
          closeBtn.addEventListener('click', function(ev) { ev.stopPropagation(); doClose(); });

          // 点击弹窗外部关闭
          outsideHandler = function(ev) {
            if (!p.contains(ev.target)) {
              doClose();
            }
          };
          setTimeout(function() {
            document.addEventListener('click', outsideHandler, true);
          }, 0);

          // 移除 blur 延迟关闭，避免误关弹窗
          // ta 失焦不再自动关闭弹窗
        } catch(_e) {
          // fallback: native prompt（高亮已存在）
          try {
            var t = window.prompt('标注备注:');
            if (t && t.trim()) {
              var info = getElementInfo(target);
              info.pageUrl = window.location.href;
              info.pageTitle = document.title;
              console.log('__ANN__:' + JSON.stringify({
                type: 'annotation-note',
                data: { elementInfo: info, text: t.trim(), highlightId: hid }
              }));
            } else {
              doRemoveHighlight(hid);
            }
          } catch(__) {}
        }
      }, true);

      // —— 监听来自渲染进程的高亮移除指令 ——
      window.addEventListener('message', function(event) {
        if (event.data.type === 'REMOVE_HIGHLIGHT') {
          doRemoveHighlight(event.data.highlightId);
        }
      });

      console.log('[MetaCode] Annotation script injected');
    })();
  `;
}

// ==========================================
// 应用生命周期
// ==========================================
app.whenReady().then(async () => {
  try {
    await initStore();
    const appConfig = store.get("appConfig") || { fontSize: 14, autoLaunch: false };
    if (appConfig.autoLaunch) {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    }
    setupIpcHandlers();
    const { registerAgentIPC, initMemorySystem, getAgentSystem } = await import("./agent-ipc.js");
    registerAgentIPC(store);
    // 初始化记忆系统（RAG + 向量记忆）
    try {
      const savedMemCfg = store.get("memoryConfig") || {};
      const embBaseUrl = savedMemCfg.embeddingBaseUrl || "https://api.openai.com/v1";
      const embApiKey = savedMemCfg.embeddingApiKey || "";
      const embModel = savedMemCfg.embeddingModel || "text-embedding-3-small";
      let apiKey = embApiKey;
      if (!apiKey) {
        const activeModelId = store.get("activeModelId");
        const models = store.get("models") as ModelConfig[];
        const activeModel = models.find((m: ModelConfig) => m.id === activeModelId);
        if (activeModel?.apiKey) apiKey = activeModel.apiKey;
      }
      initMemorySystem({
        baseUrl: embBaseUrl,
        apiKey: apiKey || undefined,
        model: embModel,
      });
    } catch {
      initMemorySystem();
    }
    await initClaudeAgent();
    // 将 MCP 工具注入 Claude Agent
    try {
      const agentSys = getAgentSystem();
      if (agentSys && claudeAgentInstance) {
        claudeAgentInstance.setMCPClient(agentSys.mcpClient);
        console.log("[Main] MCP 客户端已注入 Claude Agent");
      }
    } catch (e) {
      console.warn("[Main] MCP 注入失败:", e);
    }
  } catch (e) {
    console.error("[Main] 初始化阶段出错:", e);
  }

  // 无论如何都创建窗口
  try {
    createMainWindow();
  } catch (e) {
    console.error("[Main] 窗口创建失败，使用回退配置:", e);
    try {
      mainWindow = new BrowserWindow({ width: 1400, height: 900 });
      mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));
    } catch {
      console.error("[Main] 回退窗口也创建失败");
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
