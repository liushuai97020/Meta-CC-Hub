/**
 * 代码查看器组件
 * 使用 Monaco Editor (本地加载) 提供专业语法高亮
 * 支持代码选中标注、发送给 AI
 */
import React, { useRef, useCallback, useState, useMemo } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useAppStore } from "../stores/appStore";
import {
  Copy,
  Send,
  FileCode,
  Check,
  Highlighter,
  X,
  Plus,
} from "lucide-react";
import { Button } from "./ui/button";

// ========================
// 配置 Monaco 本地加载 (Vite worker 方案)
// ========================

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

// 定义自定义主题
monaco.editor.defineTheme("techcc-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6A9955" },
    { token: "keyword", foreground: "569CD6" },
    { token: "string", foreground: "CE9178" },
    { token: "number", foreground: "B5CEA8" },
    { token: "type", foreground: "4EC9B0" },
    { token: "function", foreground: "DCDCAA" },
  ],
  colors: {
    "editor.background": "#1e1e2e",
    "editor.foreground": "#d4d4d4",
    "editor.lineHighlightBackground": "#2a2a3e",
    "editor.selectionBackground": "#264f78",
    "editorLineNumber.foreground": "#858585",
    "editorLineNumber.activeForeground": "#c6c6c6",
    "editorIndentGuide.background": "#2a2a3e",
  },
});

monaco.editor.defineTheme("techcc-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "008000" },
    { token: "keyword", foreground: "0000FF" },
    { token: "string", foreground: "A31515" },
    { token: "number", foreground: "098658" },
  ],
  colors: {
    "editor.background": "#f8f9fa",
    "editor.foreground": "#333333",
    "editor.lineHighlightBackground": "#e8e8e8",
    "editor.selectionBackground": "#add6ff",
    "editorLineNumber.foreground": "#a0a0a0",
    "editorLineNumber.activeForeground": "#5a5a5a",
    "editorIndentGuide.background": "#e0e0e0",
  },
});

// ========================
// 代码标注接口
// ========================

interface CodeAnnotation {
  id: string;
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
  selectedText: string;
  note: string;
}

interface CodeViewerProps {
  path: string;
  content: string;
  language?: string;
  onSendToAgent?: (content: string, path: string) => void;
  onSendAnnotated?: (content: string, path: string, annotations: CodeAnnotation[]) => void;
}

// ========================
// 文件名 → Monaco language 映射
// ========================

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript", mts: "typescript", cts: "typescript",
  json: "json", jsonc: "json", html: "html", htm: "html",
  css: "css", scss: "scss", less: "less",
  md: "markdown", mdx: "markdown",
  py: "python", pyw: "python",
  go: "go", rs: "rust", java: "java",
  cpp: "cpp", c: "c", h: "c", hpp: "cpp", cc: "cpp", cs: "csharp",
  yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", svg: "xml",
  sql: "sql",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript",
  dockerfile: "dockerfile",
  php: "php", rb: "ruby", swift: "swift", kt: "kotlin", kts: "kotlin",
  dart: "dart", r: "r", scala: "scala", lua: "lua", hs: "haskell",
  pl: "perl", pm: "perl", ex: "elixir", exs: "elixir", erl: "erlang",
  clj: "clojure", cljs: "clojure",
};

function inferLanguage(filename: string): string {
  const name = filename.split("/").pop()?.toLowerCase() || filename;
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  if (name.startsWith(".env")) return "plaintext";
  const ext = filename.split(".").pop()?.toLowerCase();
  return (ext && EXT_TO_LANGUAGE[ext]) || "plaintext";
}

// ========================
// 主组件
// ========================

const CodeViewer: React.FC<CodeViewerProps> = ({
  path,
  content,
  language,
  onSendToAgent,
  onSendAnnotated,
}) => {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const showAnnotatePanelRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [annotations, setAnnotations] = useState<CodeAnnotation[]>([]);
  const [showAnnotatePanel, setShowAnnotatePanel] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<Omit<CodeAnnotation, "id" | "note"> | null>(null);
  const [annotationNote, setAnnotationNote] = useState("");

  const { theme } = useAppStore();

  const lang = language || inferLanguage(path);
  const lines = useMemo(() => content.split("\n"), [content]);

  // 同步 ref 保持闭包最新
  showAnnotatePanelRef.current = showAnnotatePanel;

  // Monaco 编辑器挂载 — 监听选中变化
  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) {
        if (!showAnnotatePanelRef.current) setPendingAnnotation(null);
        return;
      }

      const model = editor.getModel();
      if (!model) return;
      const selectedText = model.getValueInRange(selection);
      if (!selectedText.trim()) return;

      setPendingAnnotation({
        startLine: selection.startLineNumber - 1,
        endLine: selection.endLineNumber - 1,
        startCol: selection.startColumn - 1,
        endCol: selection.endColumn - 1,
        selectedText,
      });
    });
  };

  // 添加标注
  const handleAddAnnotation = useCallback(() => {
    if (!pendingAnnotation) return;
    const newAnnotation: CodeAnnotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...pendingAnnotation,
      note: annotationNote,
    };
    setAnnotations((prev) => [...prev, newAnnotation]);
    setPendingAnnotation(null);
    setAnnotationNote("");
    setShowAnnotatePanel(false);
    editorRef.current?.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } as any);
  }, [pendingAnnotation, annotationNote]);

  // 删除标注
  const handleRemoveAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // 发送到 AI（通过 props 交由父组件处理）
  const handleSendToAgent = useCallback(() => {
    // 没有选中也没有标注，发送整个文件
    if (!pendingAnnotation && annotations.length === 0) {
      const filename = path.split("/").pop() || path;
      const fileExt = filename.split(".").pop() || "";
      const message = [
        `文件: \`${path}\``,
        ``,
        "```" + fileExt,
        content,
        "```",
      ].join("\n");
      if (onSendToAgent) onSendToAgent(message, path);
      setPendingAnnotation(null);
      return;
    }

    // 有标注：每个标注带文件位置，使用标注内容作为用户指令
    if (annotations.length > 0) {
      const blocks = annotations.map((a) => {
            const lines = a.selectedText.split("\n");
            return [
              `文件: \`${path}\` (第 ${a.startLine + 1}-${a.endLine + 1} 行)`,
              ``,
              "```" + (path.split(".").pop() || ""),
              a.selectedText,
              "```",
              ``,
              a.note,
            ].filter(Boolean).join("\n");
          });

      const fullContent = blocks.join("\n\n");

      if (onSendAnnotated) {
        onSendAnnotated(fullContent, path, annotations);
      } else if (onSendToAgent) {
        onSendToAgent(fullContent, path);
      }
      setAnnotations([]);
      setPendingAnnotation(null);
      return;
    }

    // 仅选中未加标注：发位置 + 选中代码
    if (pendingAnnotation) {
      const filename = path.split("/").pop() || path;
      const fileExt = filename.split(".").pop() || "";
      const message = [
        `文件: \`${path}\` (第 ${pendingAnnotation.startLine + 1}-${pendingAnnotation.endLine + 1} 行)`,
        ``,
        "```" + fileExt,
        pendingAnnotation.selectedText,
        "```",
      ].join("\n");
      if (onSendToAgent) onSendToAgent(message, path);
      setPendingAnnotation(null);
    }
  }, [annotations, pendingAnnotation, content, path, onSendToAgent, onSendAnnotated]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleCopySelection = useCallback(() => {
    if (pendingAnnotation?.selectedText) {
      navigator.clipboard.writeText(pendingAnnotation.selectedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [pendingAnnotation]);

  // 清空所有标注
  const handleClearAnnotations = useCallback(() => {
    setAnnotations([]);
  }, []);

  // Monaco options
  const editorOptions = useMemo(() => ({
    readOnly: true,
    minimap: { enabled: false },
    fontSize: 13,
    lineNumbers: "on" as const,
    scrollBeyondLastLine: false,
    wordWrap: "off" as const,
    tabSize: 2,
    renderWhitespace: "selection" as const,
    contextmenu: false,
    folding: true,
    lineDecorationsWidth: 8,
    lineNumbersMinChars: 3,
    glyphMargin: false,
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    padding: { top: 8, bottom: 8 },
  }), []);

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <FileCode className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono truncate max-w-[200px]">
            {path.split("/").pop()}
          </span>
          <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] shrink-0">
            {lang}
          </span>
          {annotations.length > 0 && (
            <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 rounded text-[10px] shrink-0">
              {annotations.length} 个标注
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {pendingAnnotation && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-yellow-500"
              onClick={() => setShowAnnotatePanel(true)}
              title="为选中代码添加标注说明"
            >
              <Highlighter className="h-3 w-3 mr-0.5" />
              标注
            </Button>
          )}
          {annotations.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-muted-foreground"
              onClick={handleClearAnnotations}
              title="清空所有标注"
            >
              <X className="h-3 w-3 mr-0.5" />
              清除
            </Button>
          )}
          {pendingAnnotation?.selectedText && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px]"
              onClick={handleCopySelection}
              title="复制选中"
            >
              <Copy className="h-3 w-3 mr-0.5" />
              选中复制
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 mr-0.5 text-green-500" />
            ) : (
              <Copy className="h-3 w-3 mr-0.5" />
            )}
            {copied ? "已复制" : "复制"}
          </Button>
          {(pendingAnnotation || annotations.length > 0) && (
            <Button
              variant="default"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={handleSendToAgent}
            >
              <Send className="h-3 w-3 mr-0.5" />
              发送给 AI
            </Button>
          )}
        </div>
      </div>

      {/* 标注输入面板 */}
      {showAnnotatePanel && pendingAnnotation && (
        <div className="border-b border-yellow-500/30 bg-yellow-500/5 p-2 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-yellow-500 mb-1">
              已选中 {pendingAnnotation.selectedText.split("\n").length} 行
              （行 {pendingAnnotation.startLine + 1} - {pendingAnnotation.endLine + 1}）
            </div>
            <input
              type="text"
              value={annotationNote}
              onChange={(e) => setAnnotationNote(e.target.value)}
              placeholder="为这段代码添加标注说明..."
              className="w-full text-xs bg-background border border-border rounded px-2 py-1 outline-none focus:border-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && annotationNote.trim()) {
                  handleAddAnnotation();
                }
              }}
            />
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleAddAnnotation}
              disabled={!annotationNote.trim()}
            >
              <Plus className="h-3 w-3 mr-1" />
              确认
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setShowAnnotatePanel(false);
                setAnnotationNote("");
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* 已有标注列表 */}
      {annotations.length > 0 && (
        <div className="border-b border-border bg-muted/30 px-3 py-1.5 max-h-24 overflow-y-auto">
          <div className="text-[10px] text-muted-foreground mb-1">标注列表：</div>
          {annotations.map((ann) => (
            <div
              key={ann.id}
              className="flex items-center gap-2 text-xs py-0.5 group"
            >
              <span className="text-yellow-500 font-mono shrink-0">
                L{ann.startLine + 1}-L{ann.endLine + 1}
              </span>
              <span className="truncate flex-1 text-muted-foreground">{ann.note || "无描述"}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5"
                onClick={() => handleRemoveAnnotation(ann.id)}
                title="删除标注"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Monaco Editor 代码区域 */}
      <div className="flex-1 overflow-hidden">
        <Editor
          language={lang}
          value={content}
          theme={theme === "dark" ? "techcc-dark" : "techcc-light"}
          options={editorOptions}
          onMount={handleEditorMount}
          loading={
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              加载编辑器...
            </div>
          }
        />
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-3 py-1 bg-muted/30 border-t border-border text-[10px] text-muted-foreground">
        <span>{lines.length} 行</span>
        <span>{content.length} 字符</span>
      </div>
    </div>
  );
};

export default CodeViewer;
