/**
 * MetaCode 工具中心
 * 管理 MCP 服务器 + 内置工具 + 本地导入工具 + 调用日志
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useAgentStore } from "../../stores/agentStore";
import {
  Terminal, FileText, Edit3, Clock, RefreshCw,
  Server, Plus, Trash2, Search, FileCode, Plug, Package, AlertTriangle,
  ChevronDown, ChevronRight, Copy, Check,
  Filter, ArrowDownUp, History, CalendarDays,
} from "lucide-react";
import Dialog from "../../components/ui/Dialog";

const TOOL_ICONS: Record<string, any> = {
  getCurrentTime: Clock,
  Read: FileText,
  Edit: Edit3,
  Write: FileText,
  Bash: Terminal,
};
const DefaultIcon = FileCode;

/** JSON 美化 */
function prettyJson(obj: unknown, maxLen = 2000): string {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length <= maxLen ? s : s.slice(0, maxLen) + "\n…";
  } catch { return String(obj); }
}

/** 相对时间 */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

/** ============ 自定义日期范围选择器 ============ */
const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const WEEKDAYS = ["一","二","三","四","五","六","日"];

function DateRangePicker({
  startDate, endDate, onStartChange, onEndChange,
}: {
  startDate: string; endDate: string;
  onStartChange: (v: string) => void; onEndChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [pickingEnd, setPickingEnd] = useState(false);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday=0
  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, key: `${viewYear}-${viewMonth}-${d}` });
  }

  const fmtYMD = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const isInRange = (y: number, m: number, d: number) => {
    if (!startDate) return false;
    const t = new Date(y, m, d).getTime();
    const s = new Date(startDate).getTime();
    if (!endDate) return t === s;
    const e = new Date(endDate + "T23:59:59").getTime();
    return t >= s && t <= e;
  };
  const isStart = (y: number, m: number, d: number) => startDate === fmtYMD(y, m, d);
  const isEnd = (y: number, m: number, d: number) => endDate === fmtYMD(y, m, d);

  const handleDayClick = (y: number, m: number, d: number) => {
    const val = fmtYMD(y, m, d);
    if (!pickingEnd || !startDate) {
      onStartChange(val);
      if (endDate) onEndChange("");
      setPickingEnd(true);
    } else {
      const s = new Date(startDate).getTime();
      const e = new Date(y, m, d).getTime();
      if (e < s) { onStartChange(val); onEndChange(""); setPickingEnd(true); }
      else { onEndChange(val); setPickingEnd(false); }
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const hasRange = !!(startDate || endDate);
  const label = hasRange
    ? `${startDate ? new Date(startDate).toLocaleDateString("zh-CN", { month:"short", day:"numeric" }) : "…"} — ${endDate ? new Date(endDate).toLocaleDateString("zh-CN", { month:"short", day:"numeric" }) : "…"}`
    : "日期范围";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors outline-none whitespace-nowrap ${
          hasRange
            ? "bg-primary/[0.06] border-primary/30 text-primary/80 hover:bg-primary/[0.10]"
            : "bg-muted/30 border-border/50 text-muted-foreground/50 hover:text-foreground hover:border-border/70"
        }`}
      >
        <CalendarDays size={12} className={hasRange ? "text-primary/60" : "text-muted-foreground/40"} />
        <span>{label}</span>
        {(startDate || endDate) && (
          <span
            onClick={(e) => { e.stopPropagation(); onStartChange(""); onEndChange(""); setPickingEnd(false); }}
            className="ml-0.5 p-0.5 hover:bg-foreground/10 rounded transition-colors"
          >
            <Trash2 size={10} />
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-40 w-[280px] rounded-xl border border-border/40 bg-card shadow-xl p-3 select-none animate-in fade-in zoom-in-95 origin-top-left duration-150">
            {/* 月导航 */}
            <div className="flex items-center justify-between mb-2">
              <button onClick={prevMonth} className="p-1 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight size={14} className="rotate-180" />
              </button>
              <span className="text-xs font-medium text-foreground/80 tracking-wide">
                {viewYear}年 {MONTHS[viewMonth]}
              </span>
              <button onClick={nextMonth} className="p-1 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>

            {/* 星期头 */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((w) => (
                <span key={w} className="text-center text-[10px] text-muted-foreground/40 py-1">{w}</span>
              ))}
            </div>

            {/* 日期网格 */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((cell, i) => {
                if (!cell) return <span key={`e${i}`} className="aspect-square" />;
                const { day, key } = cell;
                const inRange = isInRange(viewYear, viewMonth, day);
                const start = isStart(viewYear, viewMonth, day);
                const end = isEnd(viewYear, viewMonth, day);
                const isToday = key === todayKey;
                const edge = start || end;

                return (
                  <button
                    key={key}
                    onClick={() => handleDayClick(viewYear, viewMonth, day)}
                    className={`aspect-square flex items-center justify-center text-xs rounded-md transition-colors relative ${
                      edge
                        ? "bg-primary text-primary-foreground font-medium"
                        : inRange
                          ? "bg-primary/15 text-primary/80"
                          : "text-foreground/70 hover:bg-accent/50"
                    } ${isToday && !edge ? "ring-1 ring-primary/40" : ""}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* 底部操作 */}
            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/20">
              <span className="text-[10px] text-muted-foreground/40">
                {pickingEnd && startDate ? "请选择结束日期" : startDate && endDate ? "范围已选定" : "点击选择日期"}
              </span>
              {(startDate || endDate) && (
                <button
                  onClick={() => { onStartChange(""); onEndChange(""); setPickingEnd(false); }}
                  className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  清除
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** ============ 单条可展开日志 ============ */
function LogRow({ log, forceExpand }: { log: any; forceExpand?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(!!forceExpand); }, [forceExpand]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const isSuccess = log.status === "success";
  const ToolIcon = TOOL_ICONS[log.toolName] || DefaultIcon;

  const sourceLabel =
    log.sourceType === "mcp" ? log.serverName || "MCP"
    : log.sourceType === "built-in" ? "内置工具"
    : "本地工具";

  const sourceBadgeClass =
    log.sourceType === "mcp"
      ? "bg-primary/10 text-primary/70"
      : log.sourceType === "built-in"
        ? "bg-indigo-500/10 text-indigo-400"
        : "bg-amber-500/10 text-amber-400";

  const copy = useCallback(async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  return (
    <div className={`rounded-lg border transition-colors ${
      open ? "bg-accent/10 border-border/50" : "bg-card border-border/30 hover:border-border/50"
    }`}>
      {/* 摘要行 */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        {/* 展开/折叠 */}
        <span className="shrink-0 text-muted-foreground/40">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* 状态点 */}
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${
          isSuccess ? "bg-emerald-400" : "bg-red-400"
        }`} />

        {/* 工具图标 */}
        <ToolIcon size={13} className="shrink-0 text-muted-foreground/50" />

        {/* 工具名 */}
        <span className="text-xs font-medium text-foreground/85 truncate">
          {log.toolName}
        </span>

        {/* 来源标签 */}
        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${sourceBadgeClass}`}>
          {sourceLabel}
        </span>

        {/* 间隔 */}
        <span className="flex-1" />

        {/* 输入摘要 */}
        <span className="text-xs text-muted-foreground/45 truncate max-w-[160px] hidden sm:inline">
          {JSON.stringify(log.input).slice(0, 60)}
        </span>

        {/* 耗时 */}
        <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0">
          {log.duration}ms
        </span>

        {/* 时间 */}
        <span className="text-[10px] text-muted-foreground/35 tabular-nums shrink-0 w-10 text-right">
          {relativeTime(log.timestamp)}
        </span>
      </button>

      {/* 展开详情 */}
      {open && (
        <div className="border-t border-border/20 px-3.5 pb-3.5 pt-3 space-y-3">
          {/* 入参 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                请求参数
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); copy(JSON.stringify(log.input, null, 2), `in-${log.id}`); }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-foreground/70 transition-colors"
              >
                {copiedKey === `in-${log.id}` ? <Check size={10} /> : <Copy size={10} />}
                {copiedKey === `in-${log.id}` ? "已复制" : "复制"}
              </button>
            </div>
            <pre className="text-xs font-mono text-muted-foreground/70 bg-muted/30 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-52 overflow-y-auto">
              {prettyJson(log.input)}
            </pre>
          </div>

          {/* 输出 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className={`text-[10px] uppercase tracking-wider ${
                isSuccess ? "text-emerald-400/60" : "text-red-400/60"
              }`}>
                {isSuccess ? "执行结果" : "错误信息"}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); copy(log.output, `out-${log.id}`); }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-foreground/70 transition-colors"
              >
                {copiedKey === `out-${log.id}` ? <Check size={10} /> : <Copy size={10} />}
                {copiedKey === `out-${log.id}` ? "已复制" : "复制"}
              </button>
            </div>
            <pre className={`text-xs font-mono rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-52 overflow-y-auto ${
              isSuccess
                ? "bg-muted/30 text-muted-foreground/70"
                : "bg-red-500/[0.03] text-red-400/80 border border-red-500/10"
            }`}>
              {log.output || "(无输出)"}
            </pre>
          </div>

          {/* 元数据 */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/30">
            <span>ID: {log.id?.slice(0, 8)}</span>
            <span>{new Date(log.timestamp).toLocaleString("zh-CN")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentToolCenter() {
  const { tools, builtinTools, toolLogs, loading, refreshAll, setToolLogs } = useAgentStore();
  const [view, setView] = useState<"tools" | "servers" | "logs">("servers");
  const [servers, setServers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: string } | null>(null);
  const [globalConfigOpen, setGlobalConfigOpen] = useState(false);
  const [globalConfigText, setGlobalConfigText] = useState("");
  const [globalConfigSaving, setGlobalConfigSaving] = useState(false);

  // 日志筛选
  const [logFilter, setLogFilter] = useState<"all" | "success" | "error">("all");
  const [logServerFilter, setLogServerFilter] = useState("");
  const [logStartDate, setLogStartDate] = useState("");
  const [logEndDate, setLogEndDate] = useState("");
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
  const [expandAll, setExpandAll] = useState(false);

  // 新增服务器状态
  const [newName, setNewName] = useState("");
  const [newTransportType, setNewTransportType] = useState<"stdio" | "sse" | "http">("stdio");
  const [newCommand, setNewCommand] = useState("");
  const [newArgs, setNewArgs] = useState("");
  const [newEnv, setNewEnv] = useState("");
  const [newCwd, setNewCwd] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newHeaders, setNewHeaders] = useState("");
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const msg = (text: string) => { setMessage(text); setTimeout(() => setMessage(null), 3000); };

  const buildConfigFromForm = (): Record<string, unknown> => {
    const cfg: Record<string, unknown> = { autoStart: true };
    if (newTransportType === "stdio") {
      cfg.type = "stdio";
      cfg.command = newCommand.trim();
      if (newArgs.trim()) cfg.args = newArgs.split(/\s+/).filter(Boolean);
      if (newEnv.trim()) {
        const env: Record<string, string> = {};
        for (const line of newEnv.split("\n")) {
          const eqIdx = line.indexOf("=");
          if (eqIdx > 0) env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
        }
        cfg.env = env;
      }
      if (newCwd.trim()) cfg.cwd = newCwd.trim();
    } else {
      cfg.type = newTransportType;
      cfg.url = newUrl.trim();
      if (newHeaders.trim()) {
        const headers: Record<string, string> = {};
        for (const line of newHeaders.split("\n")) {
          const eqIdx = line.indexOf(":");
          if (eqIdx > 0) headers[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
        }
        cfg.headers = headers;
      }
    }
    return cfg;
  };

  const syncJsonFromForm = () => {
    const cfg = buildConfigFromForm();
    if (newTransportType === "stdio" && !newCommand.trim()) { setJsonText(""); return; }
    if (newTransportType !== "stdio" && !newUrl.trim()) { setJsonText(""); return; }
    setJsonText(JSON.stringify(cfg, null, 2));
    setJsonError(null);
  };

  const syncFormFromJson = (text: string) => {
    setJsonText(text);
    if (!text.trim()) { setJsonError(null); return; }
    try {
      const parsed = JSON.parse(text);
      // 单个服务器配置：纯 { type, command/url, ... } 对象直接解析
      let name: string;
      let cfg: Record<string, unknown>;
      if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
        // 兼容旧格式：{ mcpServers: { name: {...} } }
        const keys = Object.keys(parsed.mcpServers);
        if (keys.length === 0) { setJsonError("mcpServers 为空"); return; }
        name = keys[0];
        cfg = parsed.mcpServers[name] as Record<string, unknown>;
      } else if (parsed.type || parsed.command || parsed.url) {
        // 单个服务器配置对象
        name = newName.trim() || "server-name";
        cfg = parsed;
      } else {
        setJsonError("无法识别配置格式，请输入 { type, command/url, ... } 单个服务器配置");
        return;
      }
      const cfgType = (cfg.type as string) || "stdio";
      if (cfgType === "stdio" && !cfg.command) { setJsonError("stdio 传输缺少 command 字段"); return; }
      if ((cfgType === "sse" || cfgType === "http") && !cfg.url) { setJsonError(`${cfgType} 传输缺少 url 字段`); return; }
      setNewName(name);
      setNewTransportType(cfgType as "stdio" | "sse" | "http");
      setNewCommand(String(cfg.command || ""));
      setNewArgs(Array.isArray(cfg.args) ? (cfg.args as string[]).join(" ") : "");
      setNewCwd(String(cfg.cwd || ""));
      setNewUrl(String(cfg.url || ""));
      if (cfg.env && typeof cfg.env === "object") {
        setNewEnv(Object.entries(cfg.env as Record<string, string>).map(([k, v]) => `${k}=${v}`).join("\n"));
      } else { setNewEnv(""); }
      if (cfg.headers && typeof cfg.headers === "object") {
        setNewHeaders(Object.entries(cfg.headers as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("\n"));
      } else { setNewHeaders(""); }
      setJsonError(null);
    } catch (err) { setJsonError(`JSON 解析错误: ${String(err)}`); }
  };

  const toggleJsonMode = () => {
    if (!jsonMode) syncJsonFromForm();
    else syncFormFromJson(jsonText);
    setJsonMode(!jsonMode);
  };

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    await refreshAll();
    try { const s = await window.electronAPI.agentV2.getServers(); setServers(s || []); } catch { setServers([]); }
  };

  /** 按筛选条件从后端查询日志（日期 + 服务器 → SQLite 时间范围查询） */
  const fetchFilteredLogs = useCallback(async () => {
    try {
      const hasFilter = logStartDate || logEndDate || logServerFilter;
      if (!hasFilter) {
        const logs = await window.electronAPI.agentV2.getToolLogs({ limit: 500 });
        setToolLogs(Array.isArray(logs) ? logs : []);
        return;
      }
      const filter: Record<string, unknown> = { limit: 500 };
      if (logServerFilter) filter.sourceName = logServerFilter;
      if (logStartDate) filter.startTime = new Date(logStartDate).getTime();
      if (logEndDate) filter.endTime = new Date(logEndDate + "T23:59:59").getTime();
      const logs = await window.electronAPI.agentV2.getToolLogs(filter);
      setToolLogs(Array.isArray(logs) ? logs : []);
    } catch { /* ignore */ }
  }, [logStartDate, logEndDate, logServerFilter, setToolLogs]);

  const handleAddServer = async () => {
    if (!newName.trim()) { msg("请填写服务器名称"); return; }
    try {
      let config: Record<string, unknown>;
      let serverName = "";
      if (jsonMode && jsonText.trim()) {
        const parsed = JSON.parse(jsonText);
        if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
          const keys = Object.keys(parsed.mcpServers);
          if (keys.length === 0) { msg("mcpServers 为空"); return; }
          serverName = keys[0];
          config = parsed.mcpServers[serverName] as Record<string, unknown>;
        } else {
          serverName = newName.trim();
          config = parsed;
        }
        const t = (config.type as string) || "stdio";
        if (t === "stdio" && !config.command) { msg("stdio 缺少 command"); return; }
        if ((t === "sse" || t === "http") && !config.url) { msg(`${t} 缺少 url`); return; }
      } else {
        serverName = newName.trim();
        if (newTransportType === "stdio" && !newCommand.trim()) { msg("请填写命令"); return; }
        if ((newTransportType === "sse" || newTransportType === "http") && !newUrl.trim()) { msg("请填写 URL"); return; }
        config = buildConfigFromForm();
      }
      const result = await window.electronAPI.agentV2.addServer(serverName, config);
      if (result.success) {
        msg(editingServerName ? `服务器 "${serverName}" 已更新` : `服务器 "${serverName}" 已添加并启动成功`);
        setNewName(""); setNewCommand(""); setNewArgs(""); setNewEnv(""); setNewCwd("");
        setNewUrl(""); setNewHeaders(""); setNewTransportType("stdio");
        setJsonText(""); setJsonMode(false); setShowAddForm(false);
        setEditingServerName(null);
      } else {
        setErrorDialog({ title: "MCP 服务器启动失败", message: result.error || "未知错误" });
      }
      loadAll();
    } catch (err) { setErrorDialog({ title: "添加失败", message: String(err) }); }
  };

  const handleEditServer = (server: any) => {
    setEditingServerName(server.name);
    const cfg = server.config || {};
    const t = (cfg.type as string) || "stdio";
    setNewName(server.name);
    setNewTransportType(t as "stdio" | "sse" | "http");
    setNewCommand(String(cfg.command || ""));
    setNewArgs(Array.isArray(cfg.args) ? (cfg.args as string[]).join(" ") : "");
    setNewCwd(String(cfg.cwd || ""));
    setNewUrl(String(cfg.url || ""));
    if (cfg.env && typeof cfg.env === "object") {
      setNewEnv(Object.entries(cfg.env as Record<string, string>).map(([k, v]) => `${k}=${v}`).join("\n"));
    } else setNewEnv("");
    if (cfg.headers && typeof cfg.headers === "object") {
      setNewHeaders(Object.entries(cfg.headers as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("\n"));
    } else setNewHeaders("");
    setJsonMode(false);
    setJsonText("");
    setJsonError(null);
    setShowAddForm(true);
  };

  const handleRemoveServer = async (name: string) => {
    try { await window.electronAPI.agentV2.removeServer(name); loadAll(); } catch { /* ignore */ }
  };

  const handleRestartServer = async (name: string) => {
    try {
      const result = await window.electronAPI.agentV2.restartServer(name);
      if (result.success) { loadAll(); }
      else { setErrorDialog({ title: "重启失败", message: result.error || "未知错误" }); }
    } catch (err) { setErrorDialog({ title: "重启失败", message: String(err) }); }
  };

  const handleImportTool = async () => {
    try {
      const result = await window.electronAPI.fs.selectDirectory();
      if (!result.success || !result.data) return;
      const res = await window.electronAPI.agentV2.importTool(result.data);
      if (res.success) { msg(`成功导入 ${res.count || 1} 个工具`); loadAll(); }
      else { msg(`导入失败: ${res.error}`); }
    } catch (err) { msg(`导入出错: ${String(err)}`); }
  };

  const filteredMCPTools = tools.filter((t: any) =>
    !searchTerm || t.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredBuiltin = builtinTools.filter((t: any) =>
    !searchTerm || t.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 日志筛选（状态筛选客户端即时响应，日期/服务器由查询按钮触发后端查询）
  const filteredLogs = toolLogs.filter((log: any) => {
    if (logFilter === "success" && log.status !== "success") return false;
    if (logFilter === "error" && log.status !== "error") return false;
    return true;
  });
  const successCount = toolLogs.filter((l: any) => l.status === "success").length;
  const errorCount = toolLogs.filter((l: any) => l.status === "error").length;

  const tabs = [
    { key: "servers" as const, label: "服务器", count: servers.length, icon: Server },
    { key: "tools" as const, label: "工具", count: tools.length + builtinTools.length, icon: Plug },
    { key: "logs" as const, label: "日志", count: toolLogs.length, icon: Clock },
  ];

  return (
    <div className="space-y-4">
      {/* ============ 视图切换 ============ */}
      <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-0.5 w-fit">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setView(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
              view === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground/60 hover:text-foreground"
            }`}>
            <tab.icon size={13} /> {tab.label}
            <span className="text-[10px] opacity-50 tabular-nums">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ============ 操作栏 ============ */}
      <div className="flex items-center gap-2 flex-wrap">
        {view === "servers" && (
          <>
            <button onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors">
              <Plus size={14} /> 新增 MCP 服务器
            </button>
            <button onClick={async () => {
              try {
                const res = await window.electronAPI.agentV2.getGlobalMCPConfig();
                if (res.success && res.data !== undefined) {
                  setGlobalConfigText(res.data);
                  setGlobalConfigOpen(true);
                } else {
                  msg(res.error || "读取全局配置失败");
                }
              } catch (err) { msg(String(err)); }
            }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border/30 hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors">
              <FileCode size={14} /> 全局配置
            </button>
          </>
        )}
        {view === "tools" && (
          <button onClick={handleImportTool}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border/30 hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors">
            <Package size={14} /> 导入工具文件夹
          </button>
        )}
        {view === "logs" && (
          <>
            {/* 状态筛选 */}
            <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5">
              {([
                { key: "all", label: "全部" },
                { key: "success", label: `成功 ${successCount}` },
                { key: "error", label: `失败 ${errorCount}` },
              ] as const).map((opt) => (
                <button key={opt.key} onClick={() => setLogFilter(opt.key)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    logFilter === opt.key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground/60 hover:text-foreground"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {/* 服务器筛选 —— 自定义下拉 */}
            {servers.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setServerDropdownOpen(!serverDropdownOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-muted-foreground hover:text-foreground transition-colors outline-none"
                >
                  <Server size={12} />
                  <span className="max-w-[100px] truncate">
                    {logServerFilter || "全部服务器"}
                  </span>
                  <ChevronDown size={10} className={`transition-transform ${serverDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {serverDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setServerDropdownOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 z-20 w-48 rounded-lg border border-border/40 bg-card shadow-lg py-0.5 max-h-48 overflow-y-auto">
                      <button
                        onClick={() => { setLogServerFilter(""); setServerDropdownOpen(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          !logServerFilter ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40"
                        }`}
                      >
                        全部服务器
                      </button>
                      {servers.map((s: any) => (
                        <button
                          key={s.name}
                          onClick={() => { setLogServerFilter(s.name); setServerDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors truncate ${
                            logServerFilter === s.name ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40"
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {/* 日期范围 */}
            <DateRangePicker
              startDate={logStartDate} endDate={logEndDate}
              onStartChange={setLogStartDate} onEndChange={setLogEndDate}
            />
            {/* 查询按钮 */}
            <button onClick={fetchFilteredLogs}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors">
              <Filter size={13} /> 查询
            </button>
            {/* 展开/折叠 */}
            <button onClick={() => setExpandAll(!expandAll)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border/30 hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowDownUp size={13} /> {expandAll ? "全部折叠" : "全部展开"}
            </button>
          </>
        )}
        <button onClick={loadAll} className="p-1.5 rounded-lg hover:bg-accent/40 text-muted-foreground transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ============ 提示消息 ============ */}
      {message && (
        <div className="px-3 py-2 text-xs rounded-lg bg-muted border border-border/40 text-muted-foreground">
          {message}
        </div>
      )}

      {/* ============ 新增服务器表单 ============ */}
      {showAddForm && (
        <div className="rounded-lg border border-border/40 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">
              {editingServerName ? `编辑 MCP 服务器：${editingServerName}` : "新增 MCP 服务器"}
            </h4>
            <button onClick={toggleJsonMode}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-md bg-muted/40 hover:bg-muted border border-border/30 text-muted-foreground hover:text-foreground transition-colors">
              {jsonMode ? "表单模式" : "JSON 编辑"}
            </button>
          </div>

          {jsonMode ? (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground/50">
                编辑单个服务器配置对象，会自动合入全局 mcpServers。完整结构请在「全局配置」中编辑。
              </p>
              <textarea value={jsonText} onChange={(e) => syncFormFromJson(e.target.value)}
                rows={12} spellCheck={false}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30 resize-y"
                placeholder={`{\n  "type": "stdio",\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"],\n  "env": { "API_KEY": "xxx" },\n  "cwd": "/path/to/work",\n  "autoStart": true\n}`}
              />
              {jsonError && <p className="text-xs text-red-400/80">{jsonError}</p>}
            </div>
          ) : (
            <div className="grid gap-3">
              <div>
                <label className="text-xs text-muted-foreground/60 mb-1 block">名称 *</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如: my-server" className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground/60 mb-1 block">传输类型</label>
                <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
                  {([
                    { key: "stdio", label: "stdio 进程", desc: "command" },
                    { key: "sse", label: "SSE 推送", desc: "URL" },
                    { key: "http", label: "Streamable HTTP", desc: "URL" },
                  ] as const).map((opt) => (
                    <button key={opt.key} type="button" onClick={() => setNewTransportType(opt.key)}
                      className={`flex-1 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                        newTransportType === opt.key
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground/50 hover:text-foreground"
                      }`}>
                      <div>{opt.label}</div>
                      <div className="text-[10px] opacity-40">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              {newTransportType === "stdio" ? (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground/60 mb-1 block">命令 *</label>
                    <input type="text" value={newCommand} onChange={(e) => setNewCommand(e.target.value)}
                      placeholder="例如: npx 或 uvx" className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground/60 mb-1 block">参数（空格分隔）</label>
                    <input type="text" value={newArgs} onChange={(e) => setNewArgs(e.target.value)}
                      placeholder="例如: -y @modelcontextprotocol/server-filesystem ./" className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground/60 mb-1 block">工作目录 cwd（可选）</label>
                    <input type="text" value={newCwd} onChange={(e) => setNewCwd(e.target.value)}
                      placeholder="例如: /home/user/project" className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground/60 mb-1 block">环境变量（可选，每行 key=value）</label>
                    <textarea value={newEnv} onChange={(e) => setNewEnv(e.target.value)}
                      rows={3} placeholder="API_KEY=xxx\nNODE_ENV=production" className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30 resize-y" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground/60 mb-1 block">URL *</label>
                    <input type="text" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="例如: https://mcp.example.com/mcp" className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground/60 mb-1 block">自定义请求头（每行 Key: Value）</label>
                    <textarea value={newHeaders} onChange={(e) => setNewHeaders(e.target.value)}
                      rows={3} placeholder="Authorization: Bearer xxx\nX-Custom-Header: value" className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30 resize-y" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground/60 mb-1 block">环境变量（每行 key=value）</label>
                    <textarea value={newEnv} onChange={(e) => setNewEnv(e.target.value)}
                      rows={2} placeholder="API_KEY=xxx" className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30 resize-y" />
                  </div>
                </>
              )}
              {((newTransportType === "stdio" && newCommand.trim()) || (newTransportType !== "stdio" && newUrl.trim())) && (
                <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">配置预览</span>
                    <button onClick={syncJsonFromForm} className="text-[10px] text-primary/60 hover:text-primary transition-colors">刷新</button>
                  </div>
                  <pre className="text-[11px] font-mono text-muted-foreground/70 whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                    {JSON.stringify(buildConfigFromForm(), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={handleAddServer}
              className="px-4 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors">
              {editingServerName ? "更新" : "添加"}
            </button>
            <button onClick={() => {
              setShowAddForm(false); setJsonMode(false); setJsonText(""); setJsonError(null);
              setEditingServerName(null);
            }}
              className="px-4 py-1.5 text-xs rounded-lg border border-border/30 hover:bg-accent/40 text-muted-foreground transition-colors">取消</button>
          </div>
        </div>
      )}

      {/* ============ 服务器列表 ============ */}
      {view === "servers" && (
        <div className="space-y-2">
          {servers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground/50 text-sm">
              暂无 MCP 服务器
              <div className="mt-2 text-xs text-muted-foreground/40">
                点击上方「新增 MCP 服务器」手动添加，或从 .claude/mcp.json 导入
              </div>
            </div>
          )}
          {servers.map((s: any) => {
            const isRunning = s.status === "running";
            return (
              <div key={s.name} className="flex items-center gap-3 p-4 rounded-lg border bg-card border-border/40 hover:border-border/60 transition-colors">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  isRunning ? "bg-emerald-400" : s.status === "error" ? "bg-red-400" : "bg-muted-foreground/30"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">{s.name}</h3>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                      isRunning ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground/60"
                    }`}>{isRunning ? "运行中" : s.status === "error" ? "错误" : "已停止"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono truncate">
                    {s.config.type === "sse" || s.config.type === "http"
                      ? `${s.config.type} → ${s.config.url || ""}`
                      : `${s.config.command || ""} ${s.config.args?.join(" ") || ""}`}
                  </p>
                  {s.error && <p className="text-xs text-red-400/70 mt-0.5">{s.error}</p>}
                  {s.tools?.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {s.tools.map((t: any) => (
                        <span key={t.name} className="px-1.5 py-0.5 text-[10px] rounded bg-primary/5 text-primary/70">{t.name}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleEditServer(s)}
                    className="p-2 rounded-lg hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors" title="编辑">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleRestartServer(s.name)}
                    className="p-2 rounded-lg hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors" title="重启">
                    <RefreshCw size={14} />
                  </button>
                  <button onClick={() => handleRemoveServer(s.name)}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors" title="删除">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ 工具列表 ============ */}
      {view === "tools" && (
        <div className="space-y-2">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <input type="text" placeholder="搜索工具..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30" />
          </div>

          {(filteredBuiltin.length > 0 || filteredMCPTools.length > 0) ? (
            <>
              {filteredBuiltin.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-1 pb-0.5">
                    <span className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">内置工具</span>
                    <span className="text-[10px] text-muted-foreground/20">{filteredBuiltin.length}</span>
                    <div className="flex-1 h-px bg-border/20" />
                  </div>
                  {filteredBuiltin.map((tool: any) => {
                    const Icon = TOOL_ICONS[tool.name] || DefaultIcon;
                    return (
                      <div key={tool.name} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/20 transition-colors border-border/40">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                          <Icon size={18} className="text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-foreground">{tool.name}</h3>
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-500/10 text-indigo-400">内置</span>
                          </div>
                          <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{tool.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {filteredMCPTools.length > 0 && (
                <>
                  <div className={`flex items-center gap-2 ${filteredBuiltin.length > 0 ? "pt-3" : "pt-0"} pb-0.5`}>
                    <span className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">MCP 工具</span>
                    <span className="text-[10px] text-muted-foreground/20">{filteredMCPTools.length}</span>
                    <div className="flex-1 h-px bg-border/20" />
                  </div>
                  {filteredMCPTools.map((tool: any) => {
                    const Icon = TOOL_ICONS[tool.name] || DefaultIcon;
                    return (
                      <div key={tool.name} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/20 transition-colors border-border/40">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Icon size={18} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-foreground">{tool.name}</h3>
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground/60">{tool.serverName}</span>
                          </div>
                          <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{tool.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground/50 text-sm">
              {searchTerm ? "没有匹配的工具" : "暂无工具，请先连接 MCP 服务器"}
            </div>
          )}
        </div>
      )}

      {/* ============ 调用日志 ============ */}
      {view === "logs" && (
        <div className="space-y-3">
          {/* 空状态 */}
          {toolLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <History className="h-6 w-6 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground/50">暂无调用记录</p>
              <p className="text-xs text-muted-foreground/30 mt-1">
                工具调用后将自动记录在此处（SQLite 持久化存储）
              </p>
            </div>
          ) : (
            <>
              {/* 日志列表 */}
              <div className="space-y-1.5">
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground/50 text-sm">
                    没有匹配的日志
                  </div>
                ) : (
                  filteredLogs.map((log: any) => (
                    <LogRow key={log.id} log={log} forceExpand={expandAll} />
                  ))
                )}
              </div>

              {/* 底部操作 */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={async () => {
                    await window.electronAPI.agentV2.clearToolLogs();
                    refreshAll();
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                >
                  清空全部日志
                </button>
                <button
                  onClick={async () => {
                    const result = await window.electronAPI.agentV2.cleanOldLogs(7);
                    if (result.success) { msg(`已清理 ${result.deleted} 条 7 天前的日志`); refreshAll(); }
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border/30 hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors"
                >
                  清理 7 天前
                </button>
                <span className="text-[11px] text-muted-foreground/35 ml-auto">
                  SQLite · {filteredLogs.length} 条记录
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ 全局配置弹窗 ============ */}
      <Dialog
        open={globalConfigOpen}
        onClose={() => setGlobalConfigOpen(false)}
        title="全局 MCP 配置"
        footer={
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setGlobalConfigSaving(true);
                try {
                  const res = await window.electronAPI.agentV2.saveGlobalMCPConfig(globalConfigText);
                  if (res.success) {
                    msg("全局配置已保存，MCP 已重新加载");
                    setGlobalConfigOpen(false);
                    loadAll();
                  } else {
                    setErrorDialog({ title: "保存失败", message: res.error || "未知错误" });
                  }
                } catch (err) {
                  setErrorDialog({ title: "保存失败", message: String(err) });
                } finally {
                  setGlobalConfigSaving(false);
                }
              }}
              disabled={globalConfigSaving}
              className="px-4 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors disabled:opacity-50"
            >
              {globalConfigSaving ? "保存中..." : "保存并重新加载"}
            </button>
            <button onClick={() => setGlobalConfigOpen(false)}
              className="px-4 py-1.5 text-xs rounded-lg border border-border/30 hover:bg-accent/40 text-muted-foreground transition-colors">取消</button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground/60">
            编辑 <code className="text-[11px] bg-muted/50 px-1 rounded">~/.metacode/mcp.json</code> 全局配置文件，保存后自动重新加载所有 MCP 服务器。
          </p>
          <textarea
            value={globalConfigText}
            onChange={(e) => setGlobalConfigText(e.target.value)}
            rows={16}
            spellCheck={false}
            className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30 resize-y"
          />
        </div>
      </Dialog>

      {/* ============ 错误弹窗 ============ */}
      <Dialog
        open={!!errorDialog}
        onClose={() => setErrorDialog(null)}
        title={errorDialog?.title || "错误"}
        footer={
          <button
            onClick={() => setErrorDialog(null)}
            className="px-4 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
          >
            我知道了
          </button>
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={16} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/90 whitespace-pre-wrap break-all font-mono text-xs">
              {errorDialog?.message}
            </p>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
