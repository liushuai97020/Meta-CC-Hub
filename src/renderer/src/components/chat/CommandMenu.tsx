/**
 * 命令菜单组件
 * / 触发命令面板 → 上下键选命令 → Enter 进入子面板
 * 子面板中上下键选项目 → Enter 直接选中返回
 * 支持 /skill /tools 等完整命令直接跳到对应子面板
 */
import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  Zap, Wrench, Server, Puzzle,
  ChevronRight, Search,
} from "lucide-react";

// ========================
// 类型定义
// ========================

export interface CommandItem {
  type: "skill" | "mcp" | "tool" | "plugin";
  id: string;
  name: string;
  description?: string;
}

interface CommandMenuProps {
  visible: boolean;
  query: string;
  onSelect: (items: CommandItem[]) => void;
  onClose: () => void;
  position?: "top" | "bottom";
}

export interface CommandMenuHandle {
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

// ========================
// 命令注册表
// ========================

const COMMAND_REGISTRY = [
  { command: "skill", label: "技能", type: "skill" as const, icon: <Zap size={14} />, description: "选择 Agent 技能" },
  { command: "mcp", label: "MCP 服务", type: "mcp" as const, icon: <Server size={14} />, description: "选择 MCP 服务器" },
  { command: "tools", label: "工具", type: "tool" as const, icon: <Wrench size={14} />, description: "选择内置/MCP 工具" },
  { command: "plugin", label: "插件", type: "plugin" as const, icon: <Puzzle size={14} />, description: "选择 Agent 插件" },
];

// ========================
// 组件
// ========================

const CommandMenu = forwardRef<CommandMenuHandle, CommandMenuProps>(({
  visible, query, onSelect, onClose, position = "top",
}, ref) => {
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [items, setItems] = useState<CommandItem[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [navIndex, setNavIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const commandListScrollRef = useRef<HTMLDivElement>(null);
  const itemListScrollRef = useRef<HTMLDivElement>(null);

  // visible 变为 true 时，检测 query 是否直接匹配某个完整命令
  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim();
    const firstWord = trimmed.split(/\s+/)[0] || "";
    // 仅完整匹配命令才进入子面板
    const matchedCmd = COMMAND_REGISTRY.find((c) => c.command === firstWord);
    if (matchedCmd) {
      setActiveCommand(matchedCmd.command);
      const rest = trimmed.slice(firstWord.length).trim();
      setItemQuery(rest);
    } else {
      setActiveCommand(null);
      setItemQuery("");
    }
  }, [visible, query]);

  // 切换命令时加载对应数据
  useEffect(() => {
    if (!activeCommand) {
      setItems([]);
      return;
    }
    setLoading(true);
    loadItems(activeCommand)
      .then((data) => {
        setItems(data);
        setNavIndex(0);
      })
      .finally(() => setLoading(false));
  }, [activeCommand]);

  // visible 变为 false 时重置
  useEffect(() => {
    if (!visible) {
      setActiveCommand(null);
      setItemQuery("");
    }
  }, [visible]);

  // 键盘导航时自动滚动到可见区域
  useEffect(() => {
    const scrollContainer = activeCommand ? itemListScrollRef.current : commandListScrollRef.current;
    if (!scrollContainer) return;
    const activeEl = scrollContainer.children[navIndex] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [navIndex, activeCommand]);

  // 点击外部关闭
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onClose]);

  // 根据命令加载数据
  const loadItems = async (cmd: string): Promise<CommandItem[]> => {
    const api = window.electronAPI;
    try {
      switch (cmd) {
        case "skill": {
          const skills = await api?.agentV2?.getSkills() || [];
          return skills.map((s: any) => ({
            type: "skill" as const, id: s.id, name: s.name, description: s.description,
          }));
        }
        case "mcp": {
          const servers = await api?.agentV2?.getServers() || [];
          return servers.map((s: any) => ({
            type: "mcp" as const, id: s.name, name: s.name,
            description: `${s.status} | ${s.config?.command || s.config?.url || ""}`,
          }));
        }
        case "tools": {
          const [builtin, mcpTools] = await Promise.all([
            api?.agentV2?.getBuiltinTools().catch(() => []) || [],
            api?.agentV2?.getTools().catch(() => []) || [],
          ]);
          const all = [...builtin, ...mcpTools];
          return all.map((t: any) => ({
            type: "tool" as const, id: t.name, name: t.name, description: t.description,
          }));
        }
        case "plugin": {
          const plugins = await api?.agentV2?.getPlugins() || [];
          return plugins.map((p: any) => ({
            type: "plugin" as const, id: p.meta?.id || p.id, name: p.meta?.name || p.name,
            description: p.meta?.description || p.description,
          }));
        }
        default:
          return [];
      }
    } catch {
      return [];
    }
  };

  // 过滤命令列表
  const filteredCommands = COMMAND_REGISTRY.filter((c) =>
    !query || c.command.includes(query) || c.label.includes(query),
  );

  // 过滤项目列表
  const filteredItems = itemQuery
    ? items.filter((i) =>
        i.name.toLowerCase().includes(itemQuery.toLowerCase()) ||
        i.description?.toLowerCase().includes(itemQuery.toLowerCase()),
      )
    : items;

  // 选中项目并立即返回
  const selectItem = useCallback((item: CommandItem) => {
    onSelect([item]);
    onClose();
  }, [onSelect, onClose]);

  // 键盘处理（从 textarea 转发）
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const list = activeCommand ? filteredItems : filteredCommands;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setNavIndex((i) => Math.min(i + 1, Math.max(0, list.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setNavIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (list.length === 0) return;
      if (activeCommand) {
        selectItem(list[navIndex] as CommandItem);
      } else {
        const cmdEntry = list[navIndex] as typeof COMMAND_REGISTRY[number];
        setActiveCommand(cmdEntry.command);
        setNavIndex(0);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (activeCommand) {
        setActiveCommand(null);
        setNavIndex(0);
      } else {
        onClose();
      }
    }
  }, [activeCommand, filteredItems, filteredCommands, navIndex, selectItem, onClose]);

  // 搜索框键盘处理：拦截导航键，其余放行（允许输入文字）
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLInputElement)?.blur();
      const list = activeCommand ? filteredItems : filteredCommands;
      if (e.key === "ArrowDown") {
        setNavIndex((i) => Math.min(i + 1, Math.max(0, list.length - 1)));
      } else if (e.key === "ArrowUp") {
        setNavIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        if (list.length > 0) {
          if (activeCommand) {
            selectItem(list[navIndex] as CommandItem);
          } else {
            const cmdEntry = list[navIndex] as typeof COMMAND_REGISTRY[number];
            setActiveCommand(cmdEntry.command);
            setNavIndex(0);
          }
        }
      } else if (e.key === "Escape") {
        if (activeCommand) {
          setActiveCommand(null);
          setNavIndex(0);
        } else {
          onClose();
        }
      }
    }
  }, [activeCommand, filteredItems, filteredCommands, navIndex, selectItem, onClose]);

  // 暴露键盘处理方法给父组件
  useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown]);

  // 全局键盘兜底：焦点不在 textarea/搜索框时仍可导航
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      const key = e.key;
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === "Escape") {
        const tag = (e.target as HTMLElement)?.tagName;
        const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
        if (isInput) return;
        e.preventDefault();
        const list = activeCommand ? filteredItems : filteredCommands;
        if (key === "ArrowDown") {
          setNavIndex((i) => Math.min(i + 1, Math.max(0, list.length - 1)));
        } else if (key === "ArrowUp") {
          setNavIndex((i) => Math.max(0, i - 1));
        } else if (key === "Enter") {
          if (list.length === 0) return;
          if (activeCommand) {
            selectItem(list[navIndex] as CommandItem);
          } else {
            const cmdEntry = list[navIndex] as typeof COMMAND_REGISTRY[number];
            setActiveCommand(cmdEntry.command);
            setNavIndex(0);
          }
        } else if (key === "Escape") {
          if (activeCommand) {
            setActiveCommand(null);
            setNavIndex(0);
          } else {
            onClose();
          }
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, activeCommand, filteredItems, filteredCommands, navIndex, selectItem, onClose]);

  if (!visible) return null;

  const activeCmdMeta = COMMAND_REGISTRY.find((c) => c.command === activeCommand);

  return (
    <div
      ref={containerRef}
      className={`absolute ${position === "top" ? "bottom-full" : "top-full"} left-0 right-0 mx-1 mb-1 rounded-xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden`}
    >
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-muted/20">
        {activeCommand ? (
          <>
            <button
              onClick={() => { setActiveCommand(null); setNavIndex(0); }}
              className="p-0.5 rounded hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight size={14} className="rotate-180" />
            </button>
            <span className="text-xs font-medium text-foreground">
              {activeCmdMeta?.label || activeCommand}
            </span>
            <span className="text-[10px] text-muted-foreground/50">Enter 选择  ESC 返回</span>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider px-1">
            可用命令
          </span>
        )}
      </div>

      {/* 面板容器 — 固定高度 + 绝对定位，避免 max-height 过渡导致的闪烁跳动 */}
      <div className="relative" style={{ height: "260px" }}>
        {/* 命令列表 */}
        <div
          ref={commandListScrollRef}
          className="absolute inset-0 overflow-y-auto transition-all duration-200 ease-out"
          style={{
            opacity: activeCommand ? 0 : 1,
            transform: activeCommand ? "translateY(-6px)" : "translateY(0)",
            pointerEvents: activeCommand ? "none" : "auto",
          }}
        >
          {filteredCommands.length === 0 ? (
            <div className="px-3 py-6 text-center text-[10px] text-muted-foreground/50">无匹配命令</div>
          ) : (
            filteredCommands.map((cmd, i) => (
              <div
                key={cmd.command}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                  i === navIndex ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/20"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setActiveCommand(cmd.command); setNavIndex(0); }}
                onMouseEnter={() => setNavIndex(i)}
              >
                <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                  {cmd.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">/{cmd.command}</span>
                    <span className="text-xs text-muted-foreground/60">{cmd.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 truncate">{cmd.description}</p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground/30" />
              </div>
            ))
          )}
        </div>

        {/* 子面板 */}
        <div
          className="absolute inset-0 flex flex-col transition-all duration-200 ease-out"
          style={{
            opacity: activeCommand ? 1 : 0,
            transform: activeCommand ? "translateY(0)" : "translateY(6px)",
            pointerEvents: activeCommand ? "auto" : "none",
          }}
        >
          {/* 搜索栏 */}
          <div className="px-3 py-1.5 shrink-0">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/30 border border-border/30">
              <Search size={12} className="text-muted-foreground/40 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={itemQuery}
                onChange={(e) => { setItemQuery(e.target.value); setNavIndex(0); }}
                onKeyDown={handleSearchKeyDown}
                placeholder={`搜索${activeCmdMeta?.label || ""}...`}
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/30 outline-none"
              />
            </div>
          </div>
          {/* 项目列表 */}
          <div ref={itemListScrollRef} className="overflow-y-auto flex-1">
            {loading ? (
              <div className="px-3 py-8 text-center text-[10px] text-muted-foreground/50">加载中...</div>
            ) : filteredItems.length === 0 ? (
              <div className="px-3 py-8 text-center text-[10px] text-muted-foreground/50">
                {activeCommand === "mcp" ? "暂无 MCP 服务器，请先在工具中心添加" : "暂无可用项"}
              </div>
            ) : (
              filteredItems.map((item, i) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors ${
                    i === navIndex ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/20"
                  }`}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setNavIndex(i)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{item.name}</div>
                    {item.description && (
                      <p className="text-[10px] text-muted-foreground/50 truncate">{item.description}</p>
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground/30 uppercase">{item.type}</span>
                  {i === navIndex && (
                    <span className="text-[9px] text-muted-foreground/40 shrink-0">↵</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

CommandMenu.displayName = "CommandMenu";

export { COMMAND_REGISTRY };
export default CommandMenu;
