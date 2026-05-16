/**
 * Tech-CC-Hub 应用根组件
 * 三栏式布局：左侧会话/文件树 | 中间对话区 | 右侧预览/轨迹面板
 * 左侧和右侧面板均可拖动调整宽度，中间对话区域有最小宽度保护
 */
import React, { useEffect, useCallback, useRef } from "react";
import { useAppStore } from "./stores/appStore";
import { useModelStore } from "./stores/modelStore";
import { useSessionStore } from "./stores/sessionStore";
import { useGatewayStore } from "./stores/gatewayStore";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import RightPanel from "./components/RightPanel";
import ResizeHandle from "./components/ResizeHandle";
import SessionTabs from "./components/SessionTabs";
import ModelSettings from "./pages/ModelSettings";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const MIN_RIGHT_PANEL_WIDTH = 300;
const MAX_RIGHT_PANEL_WIDTH = 800;
const MIN_CHAT_AREA_WIDTH = 400;

// 亮色/暗色 CSS 变量值
const THEME_VARS = {
  light: {
    "--background": "0 0% 100%",
    "--foreground": "222.2 84% 4.9%",
    "--card": "0 0% 100%",
    "--card-foreground": "222.2 84% 4.9%",
    "--popover": "0 0% 100%",
    "--popover-foreground": "222.2 84% 4.9%",
    "--primary": "248 90% 66%",
    "--primary-foreground": "210 40% 98%",
    "--secondary": "210 40% 96.1%",
    "--secondary-foreground": "222.2 47.4% 11.2%",
    "--muted": "210 40% 96.1%",
    "--muted-foreground": "215.4 16.3% 46.9%",
    "--accent": "210 40% 96.1%",
    "--accent-foreground": "222.2 47.4% 11.2%",
    "--destructive": "0 84.2% 60.2%",
    "--destructive-foreground": "210 40% 98%",
    "--border": "214.3 31.8% 91.4%",
    "--input": "214.3 31.8% 91.4%",
    "--ring": "248 90% 66%",
    "--editor-bg": "#f8f9fa",
    "--editor-border": "#e9ecef",
  },
  dark: {
    "--background": "222.2 84% 4.9%",
    "--foreground": "210 40% 98%",
    "--card": "222.2 84% 4.9%",
    "--card-foreground": "210 40% 98%",
    "--popover": "222.2 84% 4.9%",
    "--popover-foreground": "210 40% 98%",
    "--primary": "248 90% 66%",
    "--primary-foreground": "222.2 47.4% 11.2%",
    "--secondary": "217.2 32.6% 17.5%",
    "--secondary-foreground": "210 40% 98%",
    "--muted": "217.2 32.6% 17.5%",
    "--muted-foreground": "215 20.2% 65.1%",
    "--accent": "217.2 32.6% 17.5%",
    "--accent-foreground": "210 40% 98%",
    "--destructive": "0 62.8% 30.6%",
    "--destructive-foreground": "210 40% 98%",
    "--border": "217.2 32.6% 17.5%",
    "--input": "217.2 32.6% 17.5%",
    "--ring": "248 90% 66%",
    "--editor-bg": "#1a1a2e",
    "--editor-border": "#2a2a3e",
  },
};

/** 将主题 CSS 变量应用到 documentElement */
function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  const vars = THEME_VARS[theme];
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute("data-theme", theme);
}

const App: React.FC = () => {
  const { theme, showSettings } = useAppStore();
  const { loadModels } = useModelStore();
  const { loadSessions } = useSessionStore();
  const { loadProfiles } = useGatewayStore();

  // 使用 ref 跟踪容器宽度，用于计算约束
  const containerRef = useRef<HTMLDivElement>(null);

  // 初始化：加载配置、主题、模型和会话
  useEffect(() => {
    // 加载主题
    const loadTheme = async () => {
      try {
        const savedTheme = await window.electronAPI?.theme.get();
        if (savedTheme) {
          useAppStore.getState().setTheme(savedTheme);
        }
      } catch {
        console.log("Using default theme");
      }
    };

    // 加载模型配置
    const initModels = async () => {
      try {
        await loadModels();
        // 如果有模型配置，初始化 Agent
        const activeModel = await window.electronAPI?.models.getActive();
        if (activeModel) {
          await window.electronAPI?.agent.init();
          useAppStore.getState().addDiagnostic({
            status: "success",
            message: `Agent 已初始化，模型: ${activeModel.name}`,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        useAppStore.getState().addDiagnostic({
          status: "warning",
          message: "模型加载失败，请在设置中配置模型",
          timestamp: new Date().toISOString(),
        });
      }
    };

    // 加载会话
    const initSessions = async () => {
      try {
        await loadSessions();
      } catch (error) {
        console.error("Failed to load sessions:", error);
      }
    };

    loadTheme();
    initModels();
    initSessions();
    loadProfiles();
    useAppStore.getState().loadRecentProjects();
    useAppStore.getState().loadPreviewUrlHistory();
    useAppStore.getState().loadFontSize();
    useAppStore.getState().loadAutoLaunch();
    useAppStore.getState().loadGlobalProxy();

    // 设置 CSS 变量初始值（拖拽性能优化用）
    const el = containerRef.current;
    if (el) {
      el.style.setProperty('--sidebar-width', useAppStore.getState().sidebarWidth + 'px');
      el.style.setProperty('--right-panel-width', useAppStore.getState().rightPanelWidth + 'px');
    }
  }, []);

  // 应用主题 class 和 CSS 变量
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 拖拽调整左侧面板宽度（直接操作 CSS 变量，不触发 React 重渲染）
  const handleSidebarResize = useCallback(
    (delta: number) => {
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.offsetWidth;
      const state = useAppStore.getState();

      const cssVal = container.style.getPropertyValue('--sidebar-width');
      const prevWidth = cssVal ? parseFloat(cssVal) : state.sidebarWidth;

      let currentRightWidth = state.rightPanelOpen ? state.rightPanelWidth : 0;

      let newWidth = prevWidth + delta;
      if (newWidth < MIN_SIDEBAR_WIDTH) newWidth = MIN_SIDEBAR_WIDTH;
      if (newWidth > MAX_SIDEBAR_WIDTH) newWidth = MAX_SIDEBAR_WIDTH;

      const newMiddle = containerWidth - newWidth - currentRightWidth;
      if (newMiddle < MIN_CHAT_AREA_WIDTH) {
        newWidth = containerWidth - currentRightWidth - MIN_CHAT_AREA_WIDTH;
      }

      container.style.setProperty('--sidebar-width', Math.max(MIN_SIDEBAR_WIDTH, newWidth) + 'px');
    },
    [],
  );

  // 拖拽结束 → 提交到 Zustand
  const handleSidebarResizeEnd = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cssVal = container.style.getPropertyValue('--sidebar-width');
    if (cssVal) {
      const w = Math.max(MIN_SIDEBAR_WIDTH, parseFloat(cssVal));
      useAppStore.getState().setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, w));
    }
  }, []);

  // 拖拽调整右侧面板宽度（直接操作 CSS 变量）
  const handleRightPanelResize = useCallback(
    (delta: number) => {
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.offsetWidth;
      const state = useAppStore.getState();

      const cssVal = container.style.getPropertyValue('--right-panel-width');
      const prevWidth = cssVal ? parseFloat(cssVal) : state.rightPanelWidth;

      let currentLeftWidth = state.sidebarOpen ? state.sidebarWidth : 0;

      // 向右拖是正 delta，右侧面板需要缩小
      let newWidth = prevWidth - delta;
      if (newWidth < MIN_RIGHT_PANEL_WIDTH) newWidth = MIN_RIGHT_PANEL_WIDTH;
      if (newWidth > MAX_RIGHT_PANEL_WIDTH) newWidth = MAX_RIGHT_PANEL_WIDTH;

      const newMiddle = containerWidth - currentLeftWidth - newWidth;
      if (newMiddle < MIN_CHAT_AREA_WIDTH) {
        newWidth = containerWidth - currentLeftWidth - MIN_CHAT_AREA_WIDTH;
      }

      container.style.setProperty('--right-panel-width', Math.max(MIN_RIGHT_PANEL_WIDTH, newWidth) + 'px');
    },
    [],
  );

  // 拖拽结束 → 提交到 Zustand
  const handleRightPanelResizeEnd = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cssVal = container.style.getPropertyValue('--right-panel-width');
    if (cssVal) {
      const w = Math.max(MIN_RIGHT_PANEL_WIDTH, parseFloat(cssVal));
      useAppStore.getState().setRightPanelWidth(Math.min(MAX_RIGHT_PANEL_WIDTH, w));
    }
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {showSettings ? (
        <ModelSettings />
      ) : (
        <>
          {/* 标题栏 */}
          <TitleBar />

          {/* 主内容区 - 三栏可调整布局 */}
          <div ref={containerRef} className="flex flex-1 overflow-hidden">
            {/* 左侧面板：会话列表 / 文件树 */}
            <Sidebar />

            {/* 左侧拖拽手柄 */}
            <ResizeHandle direction="vertical" onResize={handleSidebarResize} onResizeEnd={handleSidebarResizeEnd} />

            {/* 中间面板：对话区域 */}
            <div
              className="flex-1 flex flex-col min-w-0"
              style={{ minWidth: `${MIN_CHAT_AREA_WIDTH}px` }}
            >
              {/* 多会话标签栏 */}
              <SessionTabs />
              <ChatArea />
            </div>

            {/* 右侧拖拽手柄 */}
            <ResizeHandle direction="vertical" onResize={handleRightPanelResize} onResizeEnd={handleRightPanelResizeEnd} />

            {/* 右侧面板：预览 / 轨迹 */}
            <RightPanel />
          </div>
        </>
      )}
    </div>
  );
};

export default App;
