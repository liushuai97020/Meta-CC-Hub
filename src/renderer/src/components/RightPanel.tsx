/**
 * 右侧面板组件
 * 包含预览窗口、代码查看器和轨迹面板的切换
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "../utils/cn";
import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import CodeViewer from "./CodeViewer";
import {
  Globe,
  Activity,
  RefreshCw,
  ExternalLink,
  FileCode,
  Crosshair,
  X,
  Plus,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

// ========================
// 代码查看器面板
// ========================

const CodePreviewPanel: React.FC = () => {
  const { codePreviewFile, codePreviewContent, currentProjectPath, setCodePreview } = useAppStore();
  const { activeSessionId, addMessage } = useSessionStore();
  const addDiagnostic = useAppStore((s) => s.addDiagnostic);
  const clearDiagnostics = useAppStore((s) => s.clearDiagnostics);

  /** agent 执行完成后刷新文件预览 */
  const refreshPreview = async (path: string) => {
    if (path !== useAppStore.getState().codePreviewFile) return;
    try {
      const result = await window.electronAPI.fs.readFile(path);
      if (result.success && result.data) {
        setCodePreview(path, result.data);
      }
    } catch { /* ignore */ }
  };

  const completeStep = (status: ExecutionStatus) => {
    useAppStore.getState().completeLastDiagnostic(status);
  };

  const handleSendToAgent = async (content: string, path: string) => {
    if (!activeSessionId) return;
    clearDiagnostics();

    await addMessage(activeSessionId, {
      role: "user",
      content,
    });

    addDiagnostic({
      status: "running",
      message: "发送代码到 AI...",
      timestamp: new Date().toISOString(),
    });

    // 流式事件监听
    window.electronAPI.agent.onStatus((status) => {
      completeStep("success");
      addDiagnostic({
        status: "running",
        message: status,
        timestamp: new Date().toISOString(),
      });
    });

    window.electronAPI.agent.onToolUse((data) => {
      completeStep("success");
      addDiagnostic({
        status: "running",
        message: `🛠 ${data.toolName}`,
        timestamp: new Date().toISOString(),
        details: { toolName: data.toolName, input: data.input },
      });
    });

    window.electronAPI.agent.onToolResult((data) => {
      completeStep(data.status === "success" ? "success" : "error");
      addDiagnostic({
        status: data.status === "success" ? "success" : "error",
        message: `✅ ${data.toolName} — ${data.status === "success" ? "完成" : "失败"}`,
        timestamp: new Date().toISOString(),
      });
    });

    window.electronAPI.agent.onDone((usage) => {
      completeStep("success");
      addDiagnostic({
        status: "success",
        message: `Token: ${(usage.inputTokens + usage.outputTokens).toLocaleString()} (输入 ${usage.inputTokens.toLocaleString()} / 输出 ${usage.outputTokens.toLocaleString()})`,
        timestamp: new Date().toISOString(),
      });
    });

    window.electronAPI.agent.onError((error) => {
      completeStep("error");
      addDiagnostic({
        status: "error",
        message: error,
        timestamp: new Date().toISOString(),
      });
    });

    try {
      const result = await window.electronAPI.agent.sendMessage(content, currentProjectPath || undefined);
      window.electronAPI.agent.removeListeners();

      if (result.success && result.data?.content) {
        await addMessage(activeSessionId, {
          role: "assistant",
          content: result.data.content,
        });
        await refreshPreview(path);
      } else {
        completeStep("error");
        addDiagnostic({
          status: "error",
          message: result.error || "发送失败",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      window.electronAPI.agent.removeListeners();
      completeStep("error");
      addDiagnostic({
        status: "error",
        message: `错误: ${String(error)}`,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleSendAnnotated = async (content: string, path: string) => {
    if (!activeSessionId) return;
    clearDiagnostics();

    await addMessage(activeSessionId, {
      role: "user",
      content,
    });

    addDiagnostic({
      status: "running",
      message: "发送标注到 AI...",
      timestamp: new Date().toISOString(),
    });

    // 流式事件监听
    window.electronAPI.agent.onStatus((status) => {
      completeStep("success");
      addDiagnostic({
        status: "running",
        message: status,
        timestamp: new Date().toISOString(),
      });
    });

    window.electronAPI.agent.onToolUse((data) => {
      completeStep("success");
      addDiagnostic({
        status: "running",
        message: `🛠 ${data.toolName}`,
        timestamp: new Date().toISOString(),
        details: { toolName: data.toolName, input: data.input },
      });
    });

    window.electronAPI.agent.onToolResult((data) => {
      completeStep(data.status === "success" ? "success" : "error");
      addDiagnostic({
        status: data.status === "success" ? "success" : "error",
        message: `✅ ${data.toolName} — ${data.status === "success" ? "完成" : "失败"}`,
        timestamp: new Date().toISOString(),
      });
    });

    window.electronAPI.agent.onDone((usage) => {
      completeStep("success");
      addDiagnostic({
        status: "success",
        message: `Token: ${(usage.inputTokens + usage.outputTokens).toLocaleString()} (输入 ${usage.inputTokens.toLocaleString()} / 输出 ${usage.outputTokens.toLocaleString()})`,
        timestamp: new Date().toISOString(),
      });
    });

    window.electronAPI.agent.onError((error) => {
      completeStep("error");
      addDiagnostic({
        status: "error",
        message: error,
        timestamp: new Date().toISOString(),
      });
    });

    try {
      const result = await window.electronAPI.agent.sendMessage(content, currentProjectPath || undefined);
      window.electronAPI.agent.removeListeners();

      if (result.success && result.data?.content) {
        await addMessage(activeSessionId, {
          role: "assistant",
          content: result.data.content,
        });
        await refreshPreview(path);
      } else {
        completeStep("error");
        addDiagnostic({
          status: "error",
          message: result.error || "发送失败",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      window.electronAPI.agent.removeListeners();
      completeStep("error");
      addDiagnostic({
        status: "error",
        message: `错误: ${String(error)}`,
        timestamp: new Date().toISOString(),
      });
    }
  };

  if (!codePreviewFile || !codePreviewContent) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <FileCode className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">点击左侧文件查看代码</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          选中代码后可添加标注，然后发送给 AI
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <CodeViewer
        path={codePreviewFile}
        content={codePreviewContent}
        onSendToAgent={handleSendToAgent}
        onSendAnnotated={handleSendAnnotated}
      />
    </div>
  );
};

// ========================
// 多标签预览面板
// ========================

interface PreviewTab {
  id: string;
  url: string;
  title: string;
}

interface PreviewPanelProps {
  isVisible: boolean;
}

/**
 * 预览面板组件
 * 支持多标签 BrowserView 预览 + DOM 节点标注
 */
const PreviewPanel: React.FC<PreviewPanelProps> = ({ isVisible }) => {
  const [tabs, setTabs] = useState<PreviewTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [showUrlHistory, setShowUrlHistory] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const urlHistoryRef = useRef<HTMLDivElement>(null);

  // 标注状态
  const { isAnnotationMode, setAnnotationMode, addAnnotationTask, clearAnnotationTasks, setCurrentPreviewUrl, previewUrlHistory, addPreviewUrl } = useAppStore();
  const annotationModeRef = useRef(false);

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const activeTabIdRef = useRef<string | null>(null);

  activeTabIdRef.current = activeTabId;

  const scheduleBoundsUpdate = useCallback(() => {
    if (!previewContainerRef.current || !activeTabIdRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = previewContainerRef.current!.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        window.electronAPI.preview.resizeActiveTab({
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
      rafRef.current = null;
    });
  }, []);

  // ResizeObserver 监听预览容器尺寸变化
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => scheduleBoundsUpdate());
    observer.observe(el);
    return () => observer.disconnect();
  }, [scheduleBoundsUpdate]);

  // 窗口大小变化监听
  useEffect(() => {
    window.addEventListener("resize", scheduleBoundsUpdate);
    return () => window.removeEventListener("resize", scheduleBoundsUpdate);
  }, [scheduleBoundsUpdate]);

  // 面板显隐时显示/隐藏 BrowserView
  useEffect(() => {
    if (isVisible && activeTabId) {
      window.electronAPI.preview.switchTab(activeTabId);
      setTimeout(scheduleBoundsUpdate, 100);
    } else if (!isVisible) {
      window.electronAPI.preview.hideAll();
    }
  }, [isVisible, activeTabId, scheduleBoundsUpdate]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      window.electronAPI.preview.hideAll();
    };
  }, []);


  // 监听标签页标题更新 + 页面重载后重新注入标注模式
  useEffect(() => {
    const handler = (data: unknown) => {
      const { tabId, title } = data as { tabId: string; title: string };
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title } : t)));
      if (annotationModeRef.current && tabId === activeTabIdRef.current) {
        const theme = useAppStore.getState().theme;
        window.electronAPI.preview.executeJavaScript(`window.postMessage({ type: 'START_ANNOTATION_MODE', theme: '${theme}' }, '*');`).catch(() => {});
      }
    };
    window.electronAPI.on("preview-tab-title-updated", handler);
    return () => window.electronAPI.removeAllListeners("preview-tab-title-updated");
  }, []);

  // 点击外部关闭 URL 历史下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (urlHistoryRef.current && !urlHistoryRef.current.contains(e.target as Node) &&
          urlInputRef.current && !urlInputRef.current.contains(e.target as Node)) {
        setShowUrlHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const handleNavigate = async (navUrl?: string) => {
    const target = (navUrl || url).trim();
    if (!target) return;
    let targetUrl = target;
    if (
      !targetUrl.startsWith("http://") &&
      !targetUrl.startsWith("https://")
    ) {
      targetUrl = `http://${targetUrl}`;
    }

    setCurrentPreviewUrl(targetUrl);
    addPreviewUrl(targetUrl);
    setShowUrlHistory(false);
    if (activeTabId) {
      await window.electronAPI.preview.navigateCurrentTab(targetUrl);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? { ...t, url: targetUrl, title: targetUrl }
            : t,
        ),
      );
    } else {
      const res = await window.electronAPI.preview.createTab(targetUrl);
      if (res.success && res.tabId) {
        setTabs((prev) => [...prev, { id: res.tabId!, url: targetUrl, title: targetUrl }]);
        setActiveTabId(res.tabId!);
        setUrl(targetUrl);
        // 新标签页自动继承当前标注开关状态 + 主题
        if (isAnnotationMode) {
          const theme = useAppStore.getState().theme;
          setTimeout(async () => {
            try {
              await window.electronAPI.preview.executeJavaScript(
                `window.postMessage({type:"START_ANNOTATION_MODE",theme:"${theme}"},"*");`,
              );
            } catch {}
          }, 500);
        }
        setTimeout(scheduleBoundsUpdate, 200);
      }
    }
  };

  // 切换标签页
  const handleSwitchTab = async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    setUrl(tab.url);
    setActiveTabId(tabId);
    setCurrentPreviewUrl(tab.url);

    await window.electronAPI.preview.switchTab(tabId);
    setTimeout(scheduleBoundsUpdate, 100);
  };

  // 关闭标签页
  const handleCloseTab = async (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.electronAPI.preview.closeTab(tabId);

    const remaining = tabs.filter((t) => t.id !== tabId);
    setTabs(remaining);

    if (activeTabId === tabId) {
      if (remaining.length > 0) {
        const last = remaining[remaining.length - 1];
        setActiveTabId(last.id);
        setUrl(last.url);
        await window.electronAPI.preview.switchTab(last.id);
        setTimeout(scheduleBoundsUpdate, 100);
      } else {
        setActiveTabId(null);
        setUrl("");
        window.electronAPI.preview.hideAll();
      }
    }
  };

  // 刷新
  const handleRefresh = async () => {
    if (activeTabId) {
      await window.electronAPI.preview.refresh();
    }
  };

  // 清空全部标注（含预览高亮清除）
  const handleClearAllAnnotations = async () => {
    clearAnnotationTasks();
    try {
      await window.electronAPI.preview.executeJavaScriptOnAll(
        'if(window.__clearAllHighlights)window.__clearAllHighlights();',
      );
    } catch {}
  };

  // ========================
  // 标注模式切换（控制所有标签页）
  // ========================
  const toggleAnnotationMode = async () => {
    const next = !isAnnotationMode;
    setAnnotationMode(next);
    annotationModeRef.current = next;
    if (next) {
      // 开启：对所有已打开的标签页注入标注脚本 + 同步主题
      const theme = useAppStore.getState().theme;
      try {
        await window.electronAPI.preview.executeJavaScriptOnAll(
          `window.postMessage({type:"START_ANNOTATION_MODE",theme:"${theme}"},"*");`,
        );
      } catch {}
    } else {
      // 关闭：停止标注交互（不清除高亮和标注列表）
      try {
        await window.electronAPI.preview.executeJavaScriptOnAll(
          'window.postMessage({type:"STOP_ANNOTATION_MODE"},"*");',
        );
      } catch {}
    }
  };

  // 同步 ref 与全局状态，确保页面重载后能正确恢复标注模式
  useEffect(() => {
    annotationModeRef.current = isAnnotationMode;
  }, [isAnnotationMode]);

  // 标注模式开启时，同步主题变更到所有标签页
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    if (!isAnnotationMode) return;
    window.electronAPI.preview
      .executeJavaScriptOnAll(
        `window.postMessage({type:"SET_THEME",theme:"${theme}"},"*");`,
      )
      .catch(() => {});
  }, [theme, isAnnotationMode]);

  // ========================
  // 标注事件监听 (来自 BrowserView)
  // ========================
  const prevAnnotationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handler = (data: unknown) => {
      const payload = data as { type: string; data: { elementInfo: ElementAnnotation; highlightId: string; text?: string } };
      if (payload.type === "annotation-note") {
        const state = useAppStore.getState();
        const info = payload.data.elementInfo;
        const compStack = info?.componentStack;
        const isFrameworkApp = compStack && compStack.length > 0;
        // 调试：打印 fiber 检测结果
        console.log('[Annotation Debug] elementInfo:', {
          tagName: info?.tagName,
          sourceFile: info?.sourceFile,
          sourceLine: info?.sourceLine,
          componentStack: info?.componentStack,
          _debug: info?._debug,
        });
        // 推导本地文件路径：优先使用 React fiber 自动提取的源码路径
        let filePath = info?.sourceFile || undefined;

        // dev server URL 视为"无有效路径"
        if (filePath && filePath.startsWith("http")) {
          filePath = undefined;
        }

        // 1) React fiber 路径是相对路径时，拼接项目路径
        if (filePath && !/^[a-zA-Z]:[/\\]/.test(filePath) && !filePath.startsWith('/')) {
          const projectPath = state.currentProjectPath;
          if (projectPath) {
            filePath = projectPath.replace(/[/\\]+$/, '') + '\\' + filePath.replace(/^\.\//, '').replace(/\//g, '\\');
          }
        }
        // 2) file:// URL 推导
        if (!filePath && state.currentPreviewUrl && state.currentPreviewUrl.startsWith("file://")) {
          filePath = decodeURIComponent(state.currentPreviewUrl.replace(/^file:\/\/\/?/, ""));
        }
        if (!filePath && info?.pageUrl?.startsWith("file://")) {
          filePath = decodeURIComponent(info.pageUrl.replace(/^file:\/\/\/?/, ""));
        }
        // 3) 从 dev server URL 映射（有组件栈说明是框架应用，跳过 index.html 映射）
        if (!filePath && state.currentPreviewUrl && state.currentProjectPath && !isFrameworkApp) {
          try {
            const u = new URL(state.currentPreviewUrl);
            let p = u.pathname;
            if (p === "/" || !p) p = "/index.html";
            filePath = state.currentProjectPath.replace(/[/\\]+$/, "") + "\\" + p.replace(/^\//, "").replace(/\//g, "\\");
          } catch {}
        }
        // 4) 项目路径兜底（框架应用也跳过）
        if (!filePath && !isFrameworkApp) {
          filePath = state.currentProjectPath || undefined;
        }

        const highlightId = payload.data.highlightId;
        addAnnotationTask({
          id: highlightId,
          text: payload.data.text || "",
          elementInfo: payload.data.elementInfo,
          createdAt: new Date().toISOString(),
          filePath,
        });

        // 5) 组件名推测文件路径（递归搜索 src/ 目录）
        if (!filePath && isFrameworkApp && state.currentProjectPath && info?.componentStack?.length > 0) {
          const compName = info.componentStack[0];
          if (compName) {
            const srcDir = state.currentProjectPath.replace(/[/\\]+$/, '') + '\\src';
            (async () => {
              try {
                const result = await window.electronAPI.fs.findFile(srcDir, compName, ['.tsx', '.jsx', '.ts', '.js']);
                if (result.success && result.data) {
                  const fullPath = result.data;
                  useAppStore.getState().updateAnnotationTask(highlightId, { filePath: fullPath });
                }
              } catch {}
            })();
          }
        }
      }
    };
    window.electronAPI.on("annotation-event", handler);
    return () => window.electronAPI.removeAllListeners("annotation-event");
  }, [addAnnotationTask]);

  // 监听标注任务列表变化：当渲染进程侧删除标注时，同步移除 BrowserView 中的高亮
  const { annotationTasks } = useAppStore();
  useEffect(() => {
    const currentIds = new Set(annotationTasks.map((t) => t.id));
    const prevIds = prevAnnotationIdsRef.current;
    const removedIds = [...prevIds].filter((id) => !currentIds.has(id));
    if (removedIds.length === 0) { prevAnnotationIdsRef.current = currentIds; return; }
    // 全部清空时用一次调用，单删时逐个移除
    if (removedIds.length === prevIds.size) {
      window.electronAPI.preview
        .executeJavaScriptOnAll('if(window.__clearAllHighlights)window.__clearAllHighlights();')
        .catch(() => {});
    } else {
      removedIds.forEach((id) => {
        window.electronAPI.preview
          .executeJavaScriptOnAll(
            `window.postMessage({type:"REMOVE_HIGHLIGHT",highlightId:"${id}"},"*");`,
          )
          .catch(() => {});
      });
    }
    prevAnnotationIdsRef.current = currentIds;
  }, [annotationTasks]);

  return (
    <div className="flex flex-col h-full">
      {/* URL 输入栏 + 标注开关 */}
      <div className="flex items-center gap-1 p-2 border-b border-border shrink-0 relative">
        <div className="flex-1 relative" ref={urlHistoryRef}>
          <Input
            ref={urlInputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onFocus={() => previewUrlHistory.length > 0 && setShowUrlHistory(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNavigate();
              if (e.key === "Escape") setShowUrlHistory(false);
            }}
            placeholder="输入 URL..."
            className="h-7 text-sm w-full focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {/* URL 历史下拉 */}
          {showUrlHistory && previewUrlHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-card shadow-lg max-h-[200px] overflow-y-auto">
              {previewUrlHistory.map((hUrl, i) => (
                <button
                  key={i}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors truncate"
                  onClick={() => {
                    setUrl(hUrl);
                    setShowUrlHistory(false);
                    handleNavigate(hUrl);
                  }}
                >
                  <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{hUrl}</span>
                </button>
              ))}
              {/* 清空历史 */}
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-left text-muted-foreground hover:text-destructive border-t border-border transition-colors"
                onClick={async () => {
                  await window.electronAPI.preview.setUrlHistory([]);
                  useAppStore.setState({ previewUrlHistory: [] });
                  setShowUrlHistory(false);
                }}
              >
                清空历史记录
              </button>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleNavigate}
          title="加载 / 导航"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleRefresh}
          title="刷新"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        {/* 标注模式开关 */}
        <Button
          variant={isAnnotationMode ? "default" : "secondary"}
          size="sm"
          className={cn(
            "h-7 text-xs gap-1 shrink-0",
            isAnnotationMode && "bg-amber-500 hover:bg-amber-600 text-white",
          )}
          onClick={toggleAnnotationMode}
          title="标注模式"
        >
          <Crosshair className="h-3.5 w-3.5" />
          {isAnnotationMode ? "标注中" : "标注"}
        </Button>
        {/* 清空全部标注 */}
        {annotationTasks.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] gap-1 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={handleClearAllAnnotations}
            title="清空全部标注"
          >
            <X className="h-3 w-3" />
            清空标注({annotationTasks.length})
          </Button>
        )}
      </div>

      {/* 多标签栏 */}
      {tabs.length > 0 && (
        <div className="flex items-center gap-0 px-1 border-b border-border overflow-x-auto shrink-0">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs cursor-pointer border-r border-border shrink-0 max-w-[160px] group",
                tab.id === activeTabId
                  ? "bg-muted/50 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => handleSwitchTab(tab.id)}
              title={tab.url}
            >
              <span className="truncate">{tab.title || tab.url}</span>
              <button
                className="ml-auto opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 shrink-0"
                onClick={(e) => handleCloseTab(tab.id, e)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            className="flex items-center justify-center px-2 py-1 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => {
              setUrl("");
              setActiveTabId(null);
              window.electronAPI.preview.hideAll();
            }}
            title="新建标签页"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 预览容器 */}
      <div
        ref={previewContainerRef}
        className={cn(
          "flex-1 relative bg-muted/30 overflow-hidden",
          tabs.length === 0 && "flex items-center justify-center",
        )}
      >
        {tabs.length === 0 ? (
          <div className="text-center">
            <Globe className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">输入 URL 加载预览</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              支持多标签页预览与元素标注
            </p>
          </div>
        ) : (
          isAnnotationMode && activeTabId && (
            <div className="absolute top-2 right-2 z-10">
              <span className="text-[10px] bg-amber-500/80 text-white px-2 py-0.5 rounded font-medium">
                标注模式 - 点击添加，右键添加备注
              </span>
            </div>
          )
        )}
      </div>

    </div>
  );
};

// ========================
// 轨迹面板组件
// ========================

/**
 * 轨迹面板组件
 * 显示 Agent 的执行轨迹和操作记录
 */
const TracePanel: React.FC = () => {
  const { diagnostics } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 诊断更新时自动滚动到底部（实时日志输出模式）
  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [diagnostics]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "running":
        return (
          <svg className="animate-spin h-3.5 w-3.5 text-blue-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        );
      case "success":
        return <span className="text-green-400 text-sm font-bold">✓</span>;
      case "error":
        return <span className="text-red-400 text-sm font-bold">✕</span>;
      case "warning":
        return <span className="text-yellow-400 text-sm font-bold">⚠</span>;
      default:
        return <span className="w-3.5 h-3.5 rounded-full bg-gray-500" />;
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case "running": return "bg-blue-500/20";
      case "success": return "bg-green-500/20";
      case "error": return "bg-red-500/20";
      case "warning": return "bg-yellow-500/20";
      default: return "bg-gray-500/20";
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span className="text-sm font-medium">执行轨迹</span>
        <Activity className="h-4 w-4 text-muted-foreground" />
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {diagnostics.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">暂无执行记录</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-2">
              {diagnostics.map((diag, index) => (
                  <div key={index} className="flex gap-3 relative">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10",
                        statusBg(diag.status),
                      )}
                    >
                      {statusIcon(diag.status)}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(diag.timestamp).toLocaleTimeString()}
                      </div>
                      <div className="text-xs mt-0.5">{diag.message}</div>
                      {diag.details && (
                        <pre className="text-[10px] mt-1 bg-muted/50 p-1.5 rounded overflow-x-auto">
                          <code>{JSON.stringify(diag.details, null, 2)}</code>
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ========================
// 右侧面板主组件
// ========================

/**
 * 右侧面板主组件
 * 包含预览、代码查看和轨迹三个子面板的切换
 */
const RightPanel: React.FC = () => {
  const { rightPanelOpen, rightPanelWidth, rightPanelTab, setRightPanelTab } =
    useAppStore();

  if (!rightPanelOpen) return null;

  return (
    <div
      className="flex flex-col h-full bg-card border-l border-border mt-8"
      style={{ width: `${rightPanelWidth}px`, minWidth: "300px" }}
    >
      {/* 面板切换标签 - 三Tab */}
      <div className="flex border-b border-border">
        <button
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1",
            rightPanelTab === "preview"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setRightPanelTab("preview")}
        >
          <Globe className="h-3.5 w-3.5" />
          预览
        </button>
        <button
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1",
            rightPanelTab === "code" || rightPanelTab === "file-preview"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setRightPanelTab("code")}
        >
          <FileCode className="h-3.5 w-3.5" />
          代码
        </button>
        <button
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1",
            rightPanelTab === "diagnostics"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setRightPanelTab("diagnostics")}
        >
          <Activity className="h-3.5 w-3.5" />
          轨迹
        </button>
      </div>

      {/* 面板内容 - 所有面板始终挂载，通过 CSS 切换显隐 */}
      <div className="flex-1 overflow-visible relative">
        <div
          className={cn(
            "absolute inset-0",
            rightPanelTab !== "preview" && "hidden",
          )}
        >
          <PreviewPanel isVisible={rightPanelTab === "preview"} />
        </div>
        <div
          className={cn(
            "absolute inset-0",
            rightPanelTab !== "code" &&
              rightPanelTab !== "file-preview" &&
              "hidden",
          )}
        >
          <CodePreviewPanel />
        </div>
        <div
          className={cn(
            "absolute inset-0",
            rightPanelTab !== "diagnostics" && "hidden",
          )}
        >
          <TracePanel />
        </div>
      </div>
    </div>
  );
};

export default RightPanel;
