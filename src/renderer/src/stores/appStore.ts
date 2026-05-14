/**
 * MetaCode  应用全局状态管理
 * 使用 Zustand 管理应用状态
 */
import { create } from "zustand";

// ========================
// 应用状态接口
// ========================

interface AppState {
  // 主题
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;

  // 侧边栏
  sidebarOpen: boolean;
  sidebarWidth: number;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number | ((prev: number) => number)) => void;

  // 右侧面板
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  rightPanelTab: "preview" | "code" | "file-preview" | "diagnostics";
  setRightPanelOpen: (open: boolean) => void;
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number | ((prev: number) => number)) => void;
  setRightPanelTab: (
    tab: "preview" | "code" | "file-preview" | "diagnostics",
  ) => void;

  // 当前项目路径
  currentProjectPath: string | null;
  setCurrentProjectPath: (path: string | null) => void;

  // 文件树缓存（持久化存储，切换项目/重启时恢复）
  fileTreeCache: Record<string, FileSystemEntry[]>;
  setFileTreeCache: (projectPath: string, tree: FileSystemEntry[]) => void;
  getFileTreeCache: (projectPath: string) => FileSystemEntry[];

  // 最近项目
  recentProjects: string[];
  loadRecentProjects: () => Promise<void>;
  openProject: (path?: string) => Promise<string | null>;
  removeRecentProject: (path: string) => Promise<void>;

  // 设置页面
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  toggleSettings: () => void;

  // 代码预览状态
  codePreviewFile: string | null;
  codePreviewContent: string | null;
  setCodePreview: (filePath: string | null, content: string | null) => void;

  // 预览源文件（用户手动指定预览对应的源码文件）
  previewSourceFile: string | null;
  setPreviewSourceFile: (filePath: string | null) => void;

  // 诊断信息
  diagnostics: DiagnosticInfo[];
  addDiagnostic: (info: DiagnosticInfo) => void;
  /** 将最后一条 running 诊断标记为指定状态（用于步骤流转） */
  completeLastDiagnostic: (status: ExecutionStatus) => void;
  clearDiagnostics: () => void;

  // 加载状态
  isLoading: boolean;
  setLoading: (loading: boolean) => void;

  // 错误信息
  error: string | null;
  setError: (error: string | null) => void;

  // 标注模式（全局开关）
  isAnnotationMode: boolean;
  setAnnotationMode: (mode: boolean) => void;

  // 当前预览 URL（用于标注时推断文件路径）
  currentPreviewUrl: string;
  setCurrentPreviewUrl: (url: string) => void;

  // 预览 URL 历史
  previewUrlHistory: string[];
  loadPreviewUrlHistory: () => Promise<void>;
  addPreviewUrl: (url: string) => void;

  // 预览面板持久化状态（跨设置页面导航保持）
  previewTabs: { id: string; url: string; title: string }[];
  previewActiveTabId: string | null;
  previewUrl: string;
  setPreviewTabs: (tabs: { id: string; url: string; title: string }[]) => void;
  setPreviewActiveTabId: (id: string | null) => void;
  setPreviewUrl: (url: string) => void;

  // 标注任务
  annotationTasks: AnnotationTask[];
  addAnnotationTask: (task: AnnotationTask) => void;
  updateAnnotationTask: (taskId: string, updates: Partial<AnnotationTask>) => void;
  removeAnnotationTask: (taskId: string) => void;
  clearAnnotationTasks: () => void;
}

/**
 * 创建应用状态 Store
 */
export const useAppStore = create<AppState>((set, get) => ({
  // 主题 - 默认深色
  theme: "dark",
  setTheme: (theme) => {
    set({ theme });
    window.electronAPI?.theme.set(theme);
  },
  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === "dark" ? "light" : "dark";
      window.electronAPI?.theme.set(newTheme);
      return { theme: newTheme };
    });
  },

  // 侧边栏
  sidebarOpen: true,
  sidebarWidth: 280,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarWidth: (width) => {
    if (typeof width === "function") {
      set((state) => ({ sidebarWidth: width(state.sidebarWidth) }));
    } else {
      set({ sidebarWidth: width });
    }
  },

  // 右侧面板
  rightPanelOpen: true,
  rightPanelWidth: 420,
  rightPanelTab: "code",
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  toggleRightPanel: () =>
    set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightPanelWidth: (width) => {
    if (typeof width === "function") {
      set((state) => ({ rightPanelWidth: width(state.rightPanelWidth) }));
    } else {
      set({ rightPanelWidth: width });
    }
  },
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  // 当前项目路径
  currentProjectPath: null,
  setCurrentProjectPath: (path) => set({ currentProjectPath: path }),

  // 文件树缓存
  fileTreeCache: {},
  setFileTreeCache: (projectPath, tree) =>
    set((state) => ({
      fileTreeCache: { ...state.fileTreeCache, [projectPath]: tree },
    })),
  getFileTreeCache: (projectPath) => {
    return get().fileTreeCache[projectPath] || [];
  },

  // 最近项目
  recentProjects: [],
  loadRecentProjects: async () => {
    try {
      const projects = await window.electronAPI.projects.getRecent();
      set({ recentProjects: projects });
    } catch {
      /* ignore */
    }
  },
  openProject: async (path) => {
    try {
      let projectPath = path;
      if (!projectPath) {
        const result = await window.electronAPI.fs.selectDirectory();
        if (!result.success || !result.data) return null;
        projectPath = result.data;
      }
      // 存储到最近项目
      await window.electronAPI.projects.addRecent(projectPath);
      const recent = await window.electronAPI.projects.getRecent();
      set({
        currentProjectPath: projectPath,
        recentProjects: recent,
      });
      return projectPath;
    } catch {
      return null;
    }
  },
  removeRecentProject: async (path) => {
    try {
      await window.electronAPI.projects.removeRecent(path);
      set((state) => ({
        recentProjects: state.recentProjects.filter((p) => p !== path),
        currentProjectPath:
          state.currentProjectPath === path ? null : state.currentProjectPath,
      }));
    } catch {
      /* ignore */
    }
  },

  // 设置页面
  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show }),
  toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),

  // 代码预览
  codePreviewFile: null,
  codePreviewContent: null,
  setCodePreview: (filePath, content) =>
    set({ codePreviewFile: filePath, codePreviewContent: content }),

  // 预览源文件（用户手动指定）
  previewSourceFile: null,
  setPreviewSourceFile: (filePath) => set({ previewSourceFile: filePath }),

  // 诊断信息
  diagnostics: [],
  addDiagnostic: (info) =>
    set((state) => ({
      diagnostics: [...state.diagnostics.slice(-99), info],
    })),
  completeLastDiagnostic: (status) =>
    set((state) => {
      const diags = [...state.diagnostics];
      for (let i = diags.length - 1; i >= 0; i--) {
        if (diags[i].status === "running" || diags[i].status === "warning") {
          diags[i] = { ...diags[i], status };
          break;
        }
      }
      return { diagnostics: diags };
    }),
  clearDiagnostics: () => set({ diagnostics: [] }),

  // 加载状态
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),

  // 错误信息
  error: null,
  setError: (error) => set({ error }),

  // 标注模式
  isAnnotationMode: false,
  setAnnotationMode: (mode) => set({ isAnnotationMode: mode }),

  // 当前预览 URL
  currentPreviewUrl: "",
  setCurrentPreviewUrl: (url) => set({ currentPreviewUrl: url }),

  // 预览面板持久化状态（跨设置页面导航保持）
  previewTabs: [],
  previewActiveTabId: null,
  previewUrl: "",
  setPreviewTabs: (tabs) => set({ previewTabs: tabs }),
  setPreviewActiveTabId: (id) => set({ previewActiveTabId: id }),
  setPreviewUrl: (url) => set({ previewUrl: url }),

  // 预览 URL 历史
  previewUrlHistory: [],
  loadPreviewUrlHistory: async () => {
    try {
      const history = await window.electronAPI.preview.getUrlHistory();
      set({ previewUrlHistory: history || [] });
    } catch { /* ignore */ }
  },
  addPreviewUrl: (url) => {
    set((state) => {
      const filtered = state.previewUrlHistory.filter(u => u !== url);
      const next = [url, ...filtered].slice(0, 20);
      window.electronAPI.preview.setUrlHistory(next).catch(() => {});
      return { previewUrlHistory: next };
    });
  },

  // 标注任务
  annotationTasks: [],
  addAnnotationTask: (task) =>
    set((state) => ({ annotationTasks: [...state.annotationTasks, task] })),
  updateAnnotationTask: (taskId, updates) =>
    set((state) => ({
      annotationTasks: state.annotationTasks.map((t) =>
        t.id === taskId ? { ...t, ...updates } : t,
      ),
    })),
  removeAnnotationTask: (taskId) =>
    set((state) => ({
      annotationTasks: state.annotationTasks.filter((t) => t.id !== taskId),
    })),
  clearAnnotationTasks: () => set({ annotationTasks: [] }),
}));
