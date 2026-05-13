/**
 * 自定义标题栏组件
 * 支持窗口拖拽、控制按钮、菜单等功能
 */
import React from "react";
import { cn } from "../utils/cn";
import { useAppStore } from "../stores/appStore";
import { useModelStore } from "../stores/modelStore";
import {
  Square,
  Minus,
  X,
  Sun,
  Moon,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { Button } from "./ui/button";

/**
 * 标题栏组件
 * 包含窗口控制按钮、主题切换、面板切换等
 */
const TitleBar: React.FC = () => {
  const {
    theme,
    toggleTheme,
    sidebarOpen,
    toggleSidebar,
    rightPanelOpen,
    toggleRightPanel,
  } = useAppStore();
  const { models, activeModelId, setActiveModel } = useModelStore();

  const activeModel = models.find((m) => m.id === activeModelId);

  return (
    <header
      className={cn(
        "titlebar flex items-center justify-between px-4",
        "bg-background border-b border-border select-none",
      )}
      style={{ height: "32px" }}
    >
      {/* 左侧：应用名称和窗口控制 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-primary">MetaCode </span>
        {activeModel && (
          <span className="text-xs text-muted-foreground ml-2">
            {activeModel.name}
          </span>
        )}
      </div>

      {/* 中间：快捷操作 */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="titlebar-button h-7 w-7"
          onClick={toggleSidebar}
          title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="titlebar-button h-7 w-7"
          onClick={toggleRightPanel}
          title={rightPanelOpen ? "收起右侧面板" : "展开右侧面板"}
        >
          <PanelRight className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className="titlebar-button h-7 w-7"
          onClick={toggleTheme}
          title={theme === "dark" ? "切换亮色模式" : "切换暗色模式"}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="flex items-center">
        <button
          className="titlebar-button inline-flex items-center justify-center w-10 h-8 hover:bg-secondary transition-colors"
          onClick={() => window.electronAPI?.window.minimize()}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          className="titlebar-button inline-flex items-center justify-center w-10 h-8 hover:bg-secondary transition-colors"
          onClick={() => window.electronAPI?.window.maximize()}
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          className="titlebar-button inline-flex items-center justify-center w-10 h-8 hover:bg-destructive hover:text-destructive-foreground transition-colors"
          onClick={() => window.electronAPI?.window.close()}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
