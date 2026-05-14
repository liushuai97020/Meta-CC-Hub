/**
 * 中间对话区域组件
 * 包含消息列表、输入框、模型切换、发送/中断按钮
 */
import React, { useState, useRef, useEffect } from "react";
import { cn } from "../utils/cn";

// 过滤掉默认/无意义样式，压缩 AI 上下文
const DROP_STYLES = new Set([
  "normal",
  "auto",
  "0px",
  "0",
  "1",
  "400",
  "rgba(0, 0, 0, 0)",
  "transparent",
  "start",
  "left",
  "static",
  "visible",
  "block",
  "border-box",
]);
// 排除标注模式可能混入的样式属性
const DROP_STYLE_KEYS = new Set([
  "cursor",
  "outline",
  "outlineColor",
  "outlineWidth",
  "outlineStyle",
  "outlineOffset",
]);
const compactStyles = (s: Record<string, string>): Record<string, string> => {
  if (!s || typeof s !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) {
    if (DROP_STYLE_KEYS.has(k)) continue;
    if (v && !DROP_STYLES.has(v)) out[k] = v;
  }
  return out;
};
/** 从源代码文件中查找标注元素所在的行号 */
async function findElementLineInFile(
  filePath: string,
  info: ElementAnnotation,
): Promise<{ start: number; end: number } | null> {
  try {
    const result = await window.electronAPI.fs.readFile(filePath);
    if (!result.success || !result.data) return null;
    const lines = result.data.split("\n");
    // 1) 优先按 id 匹配
    if (info.id) {
      const idPattern = `id="${info.id}"`;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(idPattern)) {
          let end = i;
          for (let j = i; j < lines.length && j - i < 50; j++) {
            if (lines[j].includes(`</${info.tagName}>`)) {
              end = j;
              break;
            }
          }
          return { start: i + 1, end: end + 1 };
        }
      }
    }
    // 2) 按 class 匹配
    if (info.className) {
      const classes = info.className.trim().split(/\s+/).filter(Boolean);
      for (const c of classes) {
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(`"${c}"`) || lines[i].includes(`'${c}'`)) {
            let end = i;
            for (let j = i; j < lines.length && j - i < 50; j++) {
              if (lines[j].includes(`</${info.tagName}>`)) {
                end = j;
                break;
              }
            }
            return { start: i + 1, end: end + 1 };
          }
        }
      }
    }
    // 3) 最后的 fallback：匹配 <tagName
    const tagOpen = `<${info.tagName}`;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(tagOpen)) {
        let end = i;
        for (let j = i; j < lines.length && j - i < 50; j++) {
          if (lines[j].includes(`</${info.tagName}>`)) {
            end = j;
            break;
          }
        }
        return { start: i + 1, end: end + 1 };
      }
    }
    return null;
  } catch {
    return null;
  }
}

import { useSessionStore } from "../stores/sessionStore";
import { useAppStore } from "../stores/appStore";
import { useModelStore } from "../stores/modelStore";
import { useGatewayStore } from "../stores/gatewayStore";
import {
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Terminal,
  Copy,
  Square,
  ChevronDown,
  Zap,
  Globe,
  Server,
  Cpu,
  MessageSquare,
  Image as ImageIcon,
  X,
  Info,
  ArrowUpToLine,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";

// ========================
// ========================
// 消息气泡组件
// ========================

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming }) => {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex gap-2 mb-4 items-start",
        isUser && "flex-row-reverse",
      )}
    >
      {/* 头像——始终在 DOM 首位；用户消息通过 flex-row-reverse 放到右侧 */}
      <div className={cn(
        "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
        isUser
          ? "bg-secondary text-secondary-foreground"
          : "bg-primary/20",
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
      </div>

      {/* 消息内容 */}
      <div className="flex flex-col min-w-0 max-w-[75%]">
        <div
          className={cn(
            "message-bubble",
            isUser
              ? "message-bubble-user"
              : isAssistant
                ? "message-bubble-assistant"
                : "message-bubble-system",
          )}
        >
          {/* 文本内容 - 代码块高亮渲染 */}
          <div className="text-sm leading-relaxed">
            {message.content.split(/(```[\s\S]*?```)/).map((part, i) => {
              if (part.startsWith("```")) {
                const lines = part.split("\n");
                const firstLine = lines[0];
                const lang = firstLine.replace("```", "").trim();
                const code = lines.slice(1, -1).join("\n");
                return (
                  <div key={i} className="relative group my-2">
                    <div className="flex items-center justify-between bg-editor-bg border border-editor-border rounded-t-md px-3 py-1">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {lang || "code"}
                      </span>
                      <button
                        className="text-[10px] text-muted-foreground hover:text-foreground p-0.5"
                        onClick={() => {
                          navigator.clipboard.writeText(code);
                        }}
                        title="复制代码"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                    <pre className="text-xs bg-editor-bg border border-t-0 border-editor-border rounded-b-md p-3 overflow-x-auto max-w-full w-full">
                      <code className="block whitespace-pre-wrap break-words">{code}</code>
                    </pre>
                  </div>
                );
              }
              const inlineParts = part.split(/(`[^`]+`)/);
              return (
                <span key={i} className="whitespace-pre-wrap">
                  {inlineParts.map((inlinePart, j) => {
                    if (
                      inlinePart.startsWith("`") &&
                      inlinePart.endsWith("`")
                    ) {
                      return (
                        <code
                          key={j}
                          className="bg-muted px-1 py-0.5 rounded text-xs font-mono text-primary"
                        >
                          {inlinePart.slice(1, -1)}
                        </code>
                      );
                    }
                    return <span key={j}>{inlinePart}</span>;
                  })}
                </span>
              );
            })}
          </div>

          {/* 思考中指示器（未输出文本时显示） */}
          {isStreaming && !message.content && (
            <div className="flex items-center gap-1.5 py-2">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          )}
        </div>

        {/* 时间戳 */}
        <span
          className={cn(
            "text-xs text-muted-foreground mt-1",
            isUser ? "text-right" : "text-left",
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>

    </div>
  );
};

// ========================
// 诊断面板
// ========================

interface DiagnosticPanelProps {
  diagnostics: DiagnosticInfo[];
}

const DiagnosticPanel: React.FC<DiagnosticPanelProps> = ({ diagnostics }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 诊断更新时自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [diagnostics]);

  const statusIcon = {
    idle: <Loader2 className="h-3.5 w-3.5 text-muted-foreground" />,
    running: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />,
    success: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
    error: <XCircle className="h-3.5 w-3.5 text-red-500" />,
    warning: <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />,
  };

  return (
    <div className="border-t border-border mt-4 pt-3">
      <div className="flex items-center gap-2 mb-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase">
          诊断面板
        </span>
      </div>
      <div ref={scrollRef} className="space-y-1 h-[75px] overflow-y-auto">
        {diagnostics.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-2">
            暂无诊断信息
          </div>
        )}
        {diagnostics.slice(-10).map((diag, index) => (
          <div key={index} className="flex items-center gap-2 text-xs py-0.5">
            {statusIcon[diag.status]}
            <span className="text-muted-foreground">
              {new Date(diag.timestamp).toLocaleTimeString()}
            </span>
            <span className="text-foreground truncate">{diag.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ========================
// 主对话区域组件
// ========================

type ModelSlotKey =
  | "defaultModel"
  | "expertModel"
  | "smallModel"
  | "analysisModel"
  | "imageModel";

const MODEL_SLOTS: {
  key: ModelSlotKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "defaultModel", label: "默认模型", icon: Zap },
  { key: "expertModel", label: "专家模型", icon: Cpu },
  { key: "smallModel", label: "小模型", icon: Server },
  { key: "analysisModel", label: "分析模型", icon: Globe },
  { key: "imageModel", label: "图片模型", icon: ImageIcon },
];

const ChatArea: React.FC = () => {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] =
    useState<AnnotationTask | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    taskId: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    sessions,
    activeSessionId,
    createSession,
    addMessage,
    appendMessageContent,
    updateMessageToolCalls,
    getActiveSession,
  } = useSessionStore();
  const {
    diagnostics,
    addDiagnostic,
    setLoading,
    annotationTasks,
    clearAnnotationTasks,
    removeAnnotationTask,
  } = useAppStore();
  const { activeModelId } = useModelStore();
  const currentProjectPath = useAppStore((s) => s.currentProjectPath);
  const { profiles, activeProfileId, setActiveProfile, updateProfile } =
    useGatewayStore();

  const activeSession = getActiveSession();
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const currentModelName = activeProfile?.defaultModel || "";
  // 模型就绪：模型 store 有 activeModelId，或网关配置已启用且有默认模型
  const modelReady =
    !!activeModelId ||
    (!!activeProfile && !!activeProfile.defaultModel && !!activeProfileId);

  // 自动滚动到底部（使用 auto 避免切换会话时的滚动动画）
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [activeSession?.messages]);

  // 组件卸载时清理流式监听器
  useEffect(() => {
    return () => {
      window.electronAPI?.agent?.removeListeners?.();
    };
  }, []);

  // 点击外部关闭模型菜单 & 右键菜单 & 标注详情弹窗
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
      // 关闭右键菜单
      setContextMenu(null);
      // 关闭标注详情弹窗（点击弹窗外部）
      const target = e.target as HTMLElement;
      if (
        selectedAnnotation &&
        !target.closest(".annotation-detail-popup") &&
        !target.closest(".annotation-tag")
      ) {
        setSelectedAnnotation(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [selectedAnnotation]);

  // 切换模型
  const handleModelSwitch = async (slotKey: ModelSlotKey) => {
    if (!activeProfile || !activeProfileId) return;
    const modelName = activeProfile[slotKey];
    if (!modelName || modelName === currentModelName) {
      setShowModelMenu(false);
      return;
    }
    await updateProfile(activeProfileId, { defaultModel: modelName });
    await setActiveProfile(activeProfileId);
    setShowModelMenu(false);
    addDiagnostic({
      status: "success",
      message: `切换到模型: ${modelName}`,
      timestamp: new Date().toISOString(),
    });
  };

  // 中断生成
  const handleStop = async () => {
    try {
      await window.electronAPI.agent.abort();
    } catch {}
    window.electronAPI.agent.removeListeners();
    setIsSending(false);
    setLoading(false);
    addDiagnostic({
      status: "warning",
      message: "已中断生成",
      timestamp: new Date().toISOString(),
    });
  };

  // 点击标注标签 → 滚动到元素 + 显示详情弹窗
  const handleTagClick = async (task: AnnotationTask) => {
    setSelectedAnnotation(task);
    setContextMenu(null);
    await window.electronAPI?.preview?.executeJavaScriptOnAll?.(
      `if(window.__scrollToAnnotation) window.__scrollToAnnotation("${task.id}");`,
    );
  };

  // 发送标注信息到输入框（加入对话可见，底层数据通过标注上下文传递）
  const handleSendAnnotation = (task: AnnotationTask) => {
    const idx = annotationTasks.findIndex((t) => t.id === task.id) + 1;
    const fname = task.filePath ? task.filePath.replace(/^.*[\\/]/, "") : "";
    const label = task.text || "(无备注)";
    const ref = fname
      ? `[标注#${idx}: ${fname} — ${label}]`
      : `[标注#${idx}: ${label}]`;
    setInput((prev) => prev + (prev ? " " : "") + ref);
    setSelectedAnnotation(null);
  };

  // 右键标签 → 删除
  const handleTagContextMenu = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, taskId });
  };

  // 删除标注（含预览高亮清除）
  const handleDeleteAnnotation = async (taskId: string) => {
    removeAnnotationTask(taskId);
    setContextMenu(null);
    if (selectedAnnotation?.id === taskId) setSelectedAnnotation(null);
    await window.electronAPI?.preview?.executeJavaScriptOnAll?.(
      `if(window.__removeHighlight) window.__removeHighlight("${taskId}");`,
    );
  };

  // 复制标注详细信息
  const handleCopyAnnotation = (task: AnnotationTask) => {
    const info = task.elementInfo;
    const idx = annotationTasks.findIndex((t) => t.id === task.id) + 1;
    let text = `标注 #${idx}\n`;
    text += `元素: ${info.tagName}${info.id ? "#" + info.id : ""}${info.className ? "." + info.className.split(/\s+/).join(".") : ""}\n`;
    text += `选择器: ${info.selector}\n`;
    if (info.pageUrl) text += `页面: ${info.pageUrl}\n`;
    if (task.filePath) text += `文件: ${task.filePath}\n`;
    if (task.text) text += `备注: ${task.text}\n`;
    if (task.createdAt)
      text += `时间: ${new Date(task.createdAt).toLocaleString()}\n`;
    navigator.clipboard.writeText(text);
    addDiagnostic({
      status: "success",
      message: "标注信息已复制",
      timestamp: new Date().toISOString(),
    });
  };

  // 发送消息（流式输出）
  const handleSend = async () => {
    if (isSending) return;
    let message = input.trim();

    // 读取最新 store 状态（避免闭包过期）
    const freshTasks = useAppStore.getState().annotationTasks;
    const projectPath = currentProjectPath || useAppStore.getState().currentProjectPath;

    // 如有标注任务，构建上下文数据传递给 AI
    let annotations: AnnotationContext[] | undefined;
    if (freshTasks.length > 0) {
      try {
        annotations = freshTasks
          .map((t) => {
            const d = t.elementInfo;
            if (!d) return null;
            const fname = t.filePath ? t.filePath.replace(/^.*[\\/]/, "") : "";
            const sel = `${d.tagName}${d.id ? "#" + d.id : ""}${d.className ? "." + d.className.split(/\s+/).join(".") : ""}`;
            return {
              f: fname,
              fp: t.filePath || undefined,
              sel,
              tag: d.tagName,
              s: compactStyles(d.styles || {}),
              page: d.pageUrl,
              note: t.text || "",
            };
          })
          .filter(Boolean) as AnnotationContext[];
      } catch (e) {
        console.error("[ChatArea] Failed to build annotation context:", e);
        addDiagnostic({
          status: "error",
          message: "构建标注上下文失败",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 第 4 步：构建标注指令消息发给 agent
    if (freshTasks.length > 0) {
      // 异步获取行号（如果 fiber 没有提供，从文件内容中查找）
      const lineInfoPromises = freshTasks.map(async (task) => {
        const ei = task.elementInfo;
        // 优先级 1：从 React/Vue fiber 获取的源码路径（最精确）
        let fp = ei?.sourceFile || undefined;
        // 过滤 dev server URL（bundle 路径无法映射到本地文件）
        if (fp && fp.startsWith("http")) fp = undefined;
        let srcLine = ei?.sourceLine || undefined;
        // 如果 fiber 路径是相对路径，拼接项目路径
        if (fp && !/^[a-zA-Z]:\\|^[a-zA-Z]:\/|^\//.test(fp) && projectPath) {
          fp = projectPath.replace(/[/\\]+$/, "") + "\\" + fp.replace(/^\.\//, "").replace(/\//g, "\\");
        }
        // 优先级 2：task.filePath（RightPanel 处从 codePreviewFile / dev server URL 推导）
        if (!fp) fp = task.filePath || undefined;
        // 优先级 3：尝试从 pageUrl 提取 file:// 路径
        if (!fp && ei?.pageUrl?.startsWith("file://")) {
          try {
            fp = decodeURIComponent(ei.pageUrl.replace(/^file:\/\/\/?/, ""));
          } catch {}
        }
        // 优先级 4：用组件名在项目 src/ 下递归查找文件
        if (!fp && projectPath && ei?.componentStack?.length > 0) {
          const compName = ei.componentStack[0];
          if (compName) {
            try {
              const srcDir = projectPath.replace(/[/\\]+$/, "") + "\\src";
              console.log(`[findFile] searching for "${compName}" in "${srcDir}"`);
              const found = await window.electronAPI.fs.findFile(
                srcDir,
                compName,
                [".tsx", ".jsx", ".ts", ".js"]
              );
              console.log(`[findFile] result:`, found);
              if (found.success && found.data) {
                fp = found.data;
                console.log(`[findFile] FOUND: ${fp}`);
                // 组件名反查得到的路径，fiber 行号来自 bundle.js 不可用，清空以从源码重新推导
                srcLine = undefined;
              }
            } catch (e) {
              console.error(`[findFile] error:`, e);
            }
          }
        } else if (!fp && ei?.componentStack?.length > 0) {
          console.log(`[findFile] SKIPPED: projectPath=${!!projectPath}, compStack=[${ei.componentStack.join(',')}]`);
        }
        // 如果 fiber 没有提供行号，从文件内容中查找
        if (!srcLine && fp && ei) {
          try {
            const lineInfo = await findElementLineInFile(fp, ei);
            if (lineInfo) srcLine = lineInfo.start;
          } catch {}
        }
        return { task, filePath: fp || null, srcLine, elementInfo: ei };
      });
      const lineInfos = await Promise.all(lineInfoPromises);
      // 调试：如果标注无文件路径，在轨迹面板打印逐步信息
      const noPathTasks = lineInfos.filter(p => !p.filePath);
      if (noPathTasks.length > 0) {
        noPathTasks.forEach(p => {
          const dbg = (p.elementInfo as any)?._debug || {};
          const cs = (p.elementInfo as any)?.componentStack || [];
          addDiagnostic({
            status: "warning",
            message: `标注无路径: fiber=${dbg.fiberFound}, from=${dbg.foundIn || '—'}, raw=${dbg.rawPath || '—'}, clean=${dbg.afterClean || '—'}, compStack=[${cs.join(',')}], projectPath=${!!projectPath}, error=${dbg.error || '—'}`,
            timestamp: new Date().toISOString(),
          });
        });
      }
      const isMulti = lineInfos.length > 1;
      const parts = lineInfos.map(({ task, filePath, srcLine }, idx) => {
        const prefix = isMulti ? `${idx + 1}、` : "";
        const lineStr = srcLine ? ` (第 ${srcLine}-${srcLine} 行)` : "";
        const header = filePath
          ? `${prefix}文件: \`${filePath}\`${lineStr}`
          : `${prefix}文件: （未知）${lineStr}`;
        // 构建元素 HTML 代码块（匹配 CodeViewer 中选中代码的代码块样式）
        const ei = task.elementInfo;
        let codeBlock = "";
        if (ei) {
          // 将 DOM 属性名转为 JSX 属性名，避免 agent 因 class/className 差异而困惑
          const isJsx = filePath && /\.(tsx|jsx)$/i.test(filePath);
          const attrs = (ei.attributes || [])
            .filter(function (a) {
              // 过滤掉 style 属性：runtime 计算值，不是 JSX 源中的写法
              return a.name !== 'style';
            })
            .map(function (a) {
              var name = a.name;
              if (isJsx && name === 'class') name = 'className';
              return name + '="' + a.value + '"';
            })
            .join(" ");
          var openTag = attrs
            ? "<" + ei.tagName + " " + attrs + ">"
            : "<" + ei.tagName + ">";
          // 只展示结构不展示内容，避免 agent 误以为要替换整个元素
          var inner = openTag + "\n  ...\n" + "</" + ei.tagName + ">";
          codeBlock = "\n\n\`\`\`html\n" + inner + "\n\`\`\`";
        }
        const instruction = task.text || "";
        // 如果指令明确提到改标签/结构，不加约束；否则默认保持
        const isStructuralChange = /(改.*标签|标签.*改|改成|换成|变成|变为).*(div|span|p|a|button|section|header|footer|article|nav|main|aside|h[1-6])/i.test(instruction);
        return task.text
          ? header + codeBlock + "\n\n修改要求: " + task.text + (isStructuralChange ? "" : "\n(标签名和结构保持不变)")
          : header + codeBlock;
      });
      const annotationMsg = parts.join("\n\n");
      message = message ? `${message}\n\n${annotationMsg}` : annotationMsg;
      addDiagnostic({
        status: "success",
        message: `标注指令已构建：${lineInfos.length} 个标注，发送给 AI 处理`,
        timestamp: new Date().toISOString(),
      });
    }
    // 如果 message 为空，拦截发送
    if (!message) {
      return;
    }

    let sessionId = activeSessionId;
    if (!sessionId) {
      const newSession = await createSession();
      if (!newSession) return;
      sessionId = newSession.id;
    }

    if (!modelReady) {
      addDiagnostic({
        status: "warning",
        message: "请先在设置中配置并激活模型",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 如果模型 store 没有 activeModelId 但网关配置已启用，同步初始化
    if (!activeModelId && activeProfile?.defaultModel) {
      try {
        await window.electronAPI.agent.init();
      } catch (e) {
        addDiagnostic({
          status: "error",
          message: `Agent 初始化失败: ${e}`,
          timestamp: new Date().toISOString(),
        });
        setIsSending(false);
        setLoading(false);
        return;
      }
    }

    setInput("");
    setIsSending(true);
    setLoading(true);
    useAppStore.getState().clearDiagnostics();

    await addMessage(sessionId!, {
      role: "user",
      content: message,
    });

    addDiagnostic({
      status: "running",
      message: "正在发送...",
      timestamp: new Date().toISOString(),
    });

    const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };

    try {
      await window.electronAPI.sessions.addMessage(
        sessionId!,
        assistantMessage,
      );
    } catch {}
    useSessionStore.setState((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: [...s.messages, assistantMessage],
              updatedAt: new Date().toISOString(),
            }
          : s,
      ),
    }));

    const completeStep = (status: ExecutionStatus) => {
      useAppStore.getState().completeLastDiagnostic(status);
    };

    window.electronAPI.agent.onChunk((text) => {
      appendMessageContent(sessionId!, assistantMsgId, text);
    });

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
      const tc: ToolCallResult = {
        toolName: data.toolName,
        input: data.input,
        output: null,
        status: "success",
      };
      updateMessageToolCalls(sessionId!, assistantMsgId, [tc]);
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

    window.electronAPI.agent.onError((error) => {
      completeStep("error");
      addDiagnostic({
        status: "error",
        message: error,
        timestamp: new Date().toISOString(),
      });
      window.electronAPI.agent.removeListeners();
    });

    window.electronAPI.agent.onDone((usage) => {
      completeStep("success");
      addDiagnostic({
        status: "success",
        message: `Token 消耗: ${(usage.inputTokens + usage.outputTokens).toLocaleString()} (输入 ${usage.inputTokens.toLocaleString()} / 输出 ${usage.outputTokens.toLocaleString()})`,
        timestamp: new Date().toISOString(),
      });
      window.electronAPI.agent.removeListeners();
    });

    try {
      const result = await window.electronAPI.agent.sendMessage(
        message,
        currentProjectPath || undefined,
        annotations,
      );

      if (!result.success) {
        completeStep("error");
        addDiagnostic({
          status: "error",
          message: result.error || "发送失败",
          timestamp: new Date().toISOString(),
        });
        appendMessageContent(
          sessionId!,
          assistantMsgId,
          `\n\n[错误] ${result.error || "发送失败"}`,
        );
      }
    } catch (error) {
      completeStep("error");
      addDiagnostic({
        status: "error",
        message: `错误: ${String(error)}`,
        timestamp: new Date().toISOString(),
      });
      appendMessageContent(
        sessionId!,
        assistantMsgId,
        `\n\n[错误] ${String(error)}`,
      );
    } finally {
      setIsSending(false);
      setLoading(false);
      // 流式完成后将最终消息内容持久化到磁盘
      try {
        const finalSession = useSessionStore.getState().sessions.find(s => s.id === sessionId);
        const finalMsg = finalSession?.messages.find(m => m.id === assistantMsgId);
        if (finalMsg?.content) {
          await window.electronAPI.sessions.updateMessageContent(sessionId!, assistantMsgId, finalMsg.content);
        }
      } catch {}
      // 发送完成后清除已发送的标注
      if (annotations && annotations.length > 0) {
        clearAnnotationTasks();
      }
    }
  };

  // 快捷键处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 会话 ID 标识 — 固定在聊天框顶部 */}
      {activeSession && (
        <div className="flex items-center px-4 py-1 border-b border-border/30 bg-muted/10">
          <button
            onClick={() => {
              navigator.clipboard.writeText(activeSession.id);
              addDiagnostic({
                status: "success",
                message: "会话 ID 已复制",
                timestamp: new Date().toISOString(),
              });
            }}
            className="group flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-muted/30 transition-colors"
            title="点击复制会话 ID"
          >
            <MessageSquare className="h-3 w-3 text-muted-foreground/60" />
            <code className="text-[11px] text-muted-foreground/70 font-mono">
              {activeSession.id}
            </code>
            <Copy className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
      )}
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
        {activeSession && activeSession.messages.length > 0 ? (
          activeSession.messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={isSending && idx === activeSession.messages.length - 1}
            />
          ))
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Bot className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-muted-foreground mb-2">
                MetaCode AI 编程助手
              </h2>
              <p className="text-sm text-muted-foreground max-w-md">
                在左侧配置模型后，开始对话吧！你可以：
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• 描述你想实现的功能</li>
                <li>• 请求代码审查和优化</li>
                <li>• 让 AI 协助调试问题</li>
                <li>• 使用预览窗口实时查看效果</li>
              </ul>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 诊断面板 */}
      <DiagnosticPanel diagnostics={diagnostics} />

      {/* 底部：模型切换条 + 输入区域 */}
      <div className="border-t border-border">
        {/* 模型切换条 */}
        {activeProfile && (
          <div className="flex items-center justify-end gap-2 px-4 py-1.5 border-b border-border bg-muted/20">
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowModelMenu(!showModelMenu)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span>当前:</span>
                <span className="font-medium text-foreground">
                  {currentModelName}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showModelMenu && "rotate-180",
                  )}
                />
              </button>

              {/* 模型下拉菜单 */}
              {showModelMenu && (
                <div className="absolute bottom-full mb-1 right-0 w-58 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
                  {MODEL_SLOTS.map(({ key, label, icon: Icon }) => {
                    const modelName = activeProfile[key];
                    if (!modelName) return null;
                    const isActive = modelName === currentModelName;
                    return (
                      <button
                        key={key}
                        onClick={() => handleModelSwitch(key)}
                        className={cn(
                          "flex items-center gap-2 w-full px-3 py-2.5 text-xs text-left",
                          "hover:bg-accent transition-colors",
                          isActive && "bg-accent/50",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span className="text-muted-foreground shrink-0">
                          {label}
                        </span>
                        <span className="flex-1 truncate text-foreground">
                          {modelName}
                        </span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 输入区域 */}
        <div className="p-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              {annotationTasks.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {annotationTasks.map((task, i) => (
                    <span
                      key={task.id}
                      onClick={() => handleTagClick(task)}
                      onContextMenu={(e) => handleTagContextMenu(e, task.id)}
                      className={cn(
                        "annotation-tag group relative inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded px-1.5 py-0.5 max-w-[140px] cursor-pointer",
                        "hover:bg-amber-500/20 transition-colors",
                        selectedAnnotation?.id === task.id &&
                          "bg-amber-500/25 border-amber-500/40",
                      )}
                      title={[
                        task.filePath ? `文件: ${task.filePath}` : "",
                        task.elementInfo?.componentStack?.length
                          ? `组件: ${task.elementInfo.componentStack.slice().reverse().join(" > ")}`
                          : "",
                        task.elementInfo?.pageUrl
                          ? `页面: ${task.elementInfo.pageUrl}`
                          : "",
                        task.elementInfo?.selector
                          ? `选择器: ${task.elementInfo.selector}`
                          : "",
                        "点击查看详情 · 右键删除",
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    >
                      <span className="truncate">
                        #{i + 1}{" "}
                        {task.filePath
                          ? task.filePath.replace(/^.*[\\/]/, "") + " "
                          : task.elementInfo?.componentStack?.length
                          ? task.elementInfo.componentStack[task.elementInfo.componentStack.length - 1] + " "
                          : ""}
                        {task.text || "(无备注)"}
                      </span>
                      {/* 发送到输入框 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendAnnotation(task);
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:text-primary shrink-0 transition-opacity"
                        title="发送到输入框"
                      >
                        <ArrowUpToLine className="h-2.5 w-2.5" />
                      </button>
                      {/* 删除 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnnotation(task.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0 transition-opacity"
                        title="删除标注"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* 右键菜单 */}
              {contextMenu && (
                <div
                  className="fixed z-[100] bg-popover border border-border rounded-md shadow-lg py-0.5 min-w-[120px]"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      const task = annotationTasks.find(
                        (t) => t.id === contextMenu.taskId,
                      );
                      if (task) handleSendAnnotation(task);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  >
                    <ArrowUpToLine className="h-3 w-3" />
                    发送到输入框
                  </button>
                  <button
                    onClick={() => handleDeleteAnnotation(contextMenu.taskId)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    删除标注
                  </button>
                </div>
              )}

              {/* 标注详情弹窗 */}
              {selectedAnnotation && (
                <div className="annotation-detail-popup relative mb-2 p-3 rounded-lg border border-border bg-popover shadow-lg text-xs">
                  <button
                    onClick={() => setSelectedAnnotation(null)}
                    className="absolute top-2 right-2 hover:text-foreground text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-medium text-foreground">
                      标注 #
                      {annotationTasks.findIndex(
                        (t) => t.id === selectedAnnotation.id,
                      ) + 1}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-muted-foreground">
                    {/* 元素信息 */}
                    <div className="flex gap-2">
                      <span className="text-muted-foreground/60 shrink-0 w-10">
                        元素:
                      </span>
                      <code className="text-foreground font-mono">
                        {selectedAnnotation.elementInfo.tagName}
                        {selectedAnnotation.elementInfo.id
                          ? `#${selectedAnnotation.elementInfo.id}`
                          : ""}
                        {selectedAnnotation.elementInfo.className
                          ? `.${selectedAnnotation.elementInfo.className.split(/\s+/).join(".")}`
                          : ""}
                      </code>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground/60 shrink-0 w-10">
                        选择器:
                      </span>
                      <code className="text-foreground font-mono text-[10px] break-all">
                        {selectedAnnotation.elementInfo.selector}
                      </code>
                    </div>
                    {selectedAnnotation.elementInfo.rect && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground/60 shrink-0 w-10">
                          尺寸:
                        </span>
                        <span>
                          {selectedAnnotation.elementInfo.rect.width} ×{" "}
                          {selectedAnnotation.elementInfo.rect.height}
                          &nbsp;({selectedAnnotation.elementInfo.rect.x},{" "}
                          {selectedAnnotation.elementInfo.rect.y})
                        </span>
                      </div>
                    )}
                    {/* CSS 样式摘要 */}
                    {selectedAnnotation.elementInfo.styles &&
                      Object.keys(selectedAnnotation.elementInfo.styles)
                        .length > 0 && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground/60 shrink-0 w-10">
                            样式:
                          </span>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                            {Object.entries(
                              selectedAnnotation.elementInfo.styles,
                            )
                              .slice(0, 8)
                              .map(([k, v]) => (
                                <span key={k} className="text-[10px]">
                                  <span className="text-muted-foreground/60">
                                    {k}:
                                  </span>{" "}
                                  <span className="text-foreground">{v}</span>
                                </span>
                              ))}
                            {Object.keys(selectedAnnotation.elementInfo.styles)
                              .length > 8 && (
                              <span className="text-[10px] text-muted-foreground/60">
                                +
                                {Object.keys(
                                  selectedAnnotation.elementInfo.styles,
                                ).length - 8}{" "}
                                项
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    {/* 页面 URL */}
                    {selectedAnnotation.elementInfo.pageUrl && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground/60 shrink-0 w-10">
                          页面:
                        </span>
                        <span className="truncate">
                          {selectedAnnotation.elementInfo.pageUrl}
                        </span>
                      </div>
                    )}
                    {/* 页面标题 */}
                    {selectedAnnotation.elementInfo.pageTitle && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground/60 shrink-0 w-10">
                          标题:
                        </span>
                        <span className="truncate">
                          {selectedAnnotation.elementInfo.pageTitle}
                        </span>
                      </div>
                    )}
                    {/* 文件路径 */}
                    {selectedAnnotation.filePath ? (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground/60 shrink-0 w-10">
                          文件:
                        </span>
                        <span className="truncate">
                          {selectedAnnotation.filePath}
                        </span>
                      </div>
                    ) : selectedAnnotation.elementInfo?.sourceFile ? (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground/60 shrink-0 w-10">
                          文件:
                        </span>
                        <span className="truncate">
                          {selectedAnnotation.elementInfo.sourceFile}
                        </span>
                      </div>
                    ) : null}
                    {/* 组件栈 */}
                    {selectedAnnotation.elementInfo?.componentStack &&
                      selectedAnnotation.elementInfo.componentStack.length > 0 && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground/60 shrink-0 w-10">
                          组件:
                        </span>
                        <span className="text-foreground font-mono text-[10px] break-all">
                          {[...selectedAnnotation.elementInfo.componentStack].reverse().join(" < ")}
                        </span>
                      </div>
                    )}
                    {/* 备注 */}
                    {selectedAnnotation.text && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground/60 shrink-0 w-10">
                          备注:
                        </span>
                        <span className="text-foreground">
                          {selectedAnnotation.text}
                        </span>
                      </div>
                    )}
                    {/* 时间 */}
                    {selectedAnnotation.createdAt && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground/60 shrink-0 w-10">
                          时间:
                        </span>
                        <span>
                          {new Date(
                            selectedAnnotation.createdAt,
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={() => handleCopyAnnotation(selectedAnnotation)}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      复制
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={() => handleSendAnnotation(selectedAnnotation)}
                    >
                      <ArrowUpToLine className="h-3 w-3 mr-1" />
                      发送到输入框
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] text-destructive hover:text-destructive"
                      onClick={() =>
                        handleDeleteAnnotation(selectedAnnotation.id)
                      }
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      删除
                    </Button>
                  </div>
                </div>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  modelReady
                    ? "输入消息 (Shift+Enter 换行)..."
                    : "请先在设置中配置模型..."
                }
                className={cn(
                  "w-full min-h-[40px] max-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground",
                  "focus-visible:outline-none focus-visible:border-primary/40",
                  "resize-none transition-colors",
                )}
                rows={1}
                disabled={isSending || !modelReady}
              />
            </div>
            {isSending ? (
              <Button
                onClick={handleStop}
                size="icon"
                className="h-10 w-10 shrink-0 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                title="中断生成"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={
                  (!input.trim() && annotationTasks.length === 0) ||
                  isSending ||
                  !modelReady
                }
                size="icon"
                className="h-10 w-10 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
